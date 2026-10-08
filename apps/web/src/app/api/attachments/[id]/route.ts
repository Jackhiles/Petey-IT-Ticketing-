import { getAttachment, getSessionUser, NotFoundError } from "@petey/core";

export const dynamic = "force-dynamic";

/**
 * Downloads an attachment the signed-in user may see. Files are always sent as downloads
 * with nosniff and a locked-down CSP, so an uploaded HTML or SVG file can never run in
 * Petey's origin.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getSessionUser(request.headers);
  if (!user) return new Response("Not found", { status: 404 });
  const { id } = await params;
  try {
    const file = await getAttachment(user, id);
    return new Response(Buffer.from(file.data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof NotFoundError) return new Response("Not found", { status: 404 });
    throw err;
  }
}
