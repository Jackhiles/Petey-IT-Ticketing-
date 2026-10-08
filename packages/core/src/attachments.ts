import { getPrisma } from "@petey/db";
import { attachmentMaxBytes } from "./config";
import { NotFoundError, ValidationError } from "./errors";
import { can, type Actor } from "./permissions";
import { getStorage, newStorageKey } from "./storage";

/** A file as it arrives from a form or, later, an email. */
export interface UploadInput {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

export const MAX_FILES_PER_MESSAGE = 10;

// Files that run code when opened. Downloads are always served as attachments with
// nosniff, so browsers won't execute anything, but these are refused outright.
const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "msi",
  "msp",
  "com",
  "scr",
  "pif",
  "bat",
  "cmd",
  "ps1",
  "psm1",
  "vbs",
  "vbe",
  "js",
  "jse",
  "wsf",
  "wsh",
  "hta",
  "cpl",
  "jar",
  "lnk",
  "reg",
  "dll",
  "sys",
  "app",
  "sh",
]);

/** Strips any path and control characters so the name is safe to store and to send back. */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .trim()
    .slice(0, 200);
  return cleaned || "file";
}

export function validateUploads(files: UploadInput[]): void {
  if (files.length > MAX_FILES_PER_MESSAGE) throw new ValidationError({ files: "too_many_files" });
  for (const f of files) {
    if (f.data.byteLength > attachmentMaxBytes())
      throw new ValidationError({ files: "file_too_large" });
    const ext = cleanFilename(f.filename).split(".").pop()?.toLowerCase() ?? "";
    if (BLOCKED_EXTENSIONS.has(ext)) throw new ValidationError({ files: "file_type_blocked" });
  }
}

export interface StoredUpload {
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
}

/**
 * Writes files to storage before the database transaction that records them. If the
 * transaction fails, call discardStored() so no orphaned files are left behind.
 */
export async function storeUploads(files: UploadInput[]): Promise<StoredUpload[]> {
  const storage = getStorage();
  const stored: StoredUpload[] = [];
  try {
    for (const f of files) {
      const storageKey = newStorageKey();
      await storage.put(storageKey, f.data);
      stored.push({
        filename: cleanFilename(f.filename),
        mimeType: /^[\w.+-]+\/[\w.+-]+$/.test(f.mimeType) ? f.mimeType : "application/octet-stream",
        size: f.data.byteLength,
        storageKey,
      });
    }
  } catch (err) {
    await discardStored(stored);
    throw err;
  }
  return stored;
}

export async function discardStored(stored: StoredUpload[]): Promise<void> {
  const storage = getStorage();
  await Promise.allSettled(stored.map((s) => storage.delete(s.storageKey)));
}

export interface AttachmentDownload {
  filename: string;
  mimeType: string;
  size: number;
  data: Uint8Array;
}

/**
 * Returns an attachment's bytes if the actor may see it. Requesters only get files on their
 * own tickets that are not on internal notes; anything else is reported as not found.
 */
export async function getAttachment(actor: Actor, id: string): Promise<AttachmentDownload> {
  if (!actor.isActive) throw new NotFoundError();
  const row = await getPrisma().attachment.findUnique({
    where: { id },
    include: {
      ticket: { select: { requesterId: true } },
      message: { select: { isInternal: true } },
    },
  });
  if (!row) throw new NotFoundError();

  const staff = can(actor, "ticket.viewAll");
  const allowed =
    staff ||
    (can(actor, "ticket.viewOwn", { ownerId: row.ticket.requesterId }) && !row.message?.isInternal);
  if (!allowed) throw new NotFoundError();

  return {
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    data: await getStorage().get(row.storageKey),
  };
}
