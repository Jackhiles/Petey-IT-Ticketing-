import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFileStorage, newStorageKey } from "./storage";

describe("LocalFileStorage", () => {
  let dir: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "petey-storage-"));
    storage = new LocalFileStorage(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("stores, reads and deletes a file", async () => {
    const key = newStorageKey(new Date("2026-03-05T00:00:00Z"));
    expect(key).toMatch(/^2026\/03\/[0-9a-f-]{36}$/);
    await storage.put(key, new TextEncoder().encode("hello"));
    expect(new TextDecoder().decode(await storage.get(key))).toBe("hello");
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrow();
  });

  it("never overwrites an existing file", async () => {
    const key = newStorageKey();
    await storage.put(key, new Uint8Array([1]));
    await expect(storage.put(key, new Uint8Array([2]))).rejects.toThrow();
  });

  it.each(["../etc/passwd", "/etc/passwd", "a/../../b", "a\\b", "A/B"])(
    "rejects key %j",
    async (key) => {
      await expect(storage.get(key)).rejects.toThrow(/Invalid storage key/);
    },
  );
});
