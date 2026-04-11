import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedQueueStorageAdapter } from "../src/adapters/storage/encryptedStorage";
import { IndexedDBQueueStorageAdapter } from "../src/adapters/storage/indexedDBAdapter";
import { FileSystemQueueStorageAdapter } from "../src/node/fsAdapter";
import type { OfflineQueueStorageAdapter, QueuedRequest } from "../src/middleware/offlineQueue";

function createMemoryStorage(initial: QueuedRequest[] = []): OfflineQueueStorageAdapter {
  let items = [...initial];
  return {
    async push(item) {
      items = [...items.filter((x) => x.id !== item.id), item];
    },
    async getAll() {
      return items;
    },
    async remove(id) {
      items = items.filter((x) => x.id !== id);
    },
    async clear() {
      items = [];
    },
    async size() {
      return items.length;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto as unknown as Crypto);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("EncryptedQueueStorageAdapter", () => {
  it("encrypts on push and decrypts on getAll", async () => {
    const key = await globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const inner = createMemoryStorage();
    const adapter = new EncryptedQueueStorageAdapter(inner, key);

    await adapter.push({
      id: 1,
      queuedAt: 100,
      req: { method: "POST", url: "/items", body: { id: "a" } },
    });

    const raw = await inner.getAll();
    expect(typeof (raw[0] as QueuedRequest).req).toBe("string");

    const all = await adapter.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.req).toMatchObject({ method: "POST", url: "/items" });
  });

  it("throws aggregate error when one or more entries fail decryption", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const key = await globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const inner = createMemoryStorage([
      {
        id: 1,
        queuedAt: 1,
        req: "invalid:ciphertext" as unknown as QueuedRequest["req"],
      },
    ]);
    const adapter = new EncryptedQueueStorageAdapter(inner, key);

    await expect(adapter.getAll()).rejects.toMatchObject({
      code: "PUREQ_DECRYPTION_FAILURE",
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

describe("IndexedDBQueueStorageAdapter", () => {
  it("rejects when IndexedDB is unavailable", async () => {
    const original = (globalThis as any).indexedDB;
    (globalThis as any).indexedDB = undefined;

    const adapter = new IndexedDBQueueStorageAdapter("pureq-test-db");
    await expect(adapter.size()).rejects.toThrow("pureq: IndexedDB is not available in this environment");

    (globalThis as any).indexedDB = original;
  });
});

describe("FileSystemQueueStorageAdapter", () => {
  it("stores, loads, removes, and clears queued requests", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pureq-fs-"));
    const adapter = new FileSystemQueueStorageAdapter(dir);

    await adapter.push({ id: 10, queuedAt: 1, req: { method: "POST", url: "/a" } });
    await adapter.push({ id: 11, queuedAt: 2, req: { method: "DELETE", url: "/b" } });

    expect(await adapter.size()).toBe(2);

    const all = await adapter.getAll();
    expect(all.map((x) => x.id).sort()).toEqual([10, 11]);

    await adapter.remove(10);
    expect(await adapter.size()).toBe(1);

    await adapter.clear();
    expect(await adapter.size()).toBe(0);
  });

  it("skips malformed json files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pureq-fs-"));
    const adapter = new FileSystemQueueStorageAdapter(dir);

    await writeFile(join(dir, "broken.json"), "{not-json", "utf8");
    await adapter.push({ id: 22, queuedAt: 2, req: { method: "POST", url: "/ok" } });

    const all = await adapter.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(22);
  });
});
