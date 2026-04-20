/// <reference types="node" />
import { writeFile, readFile, unlink, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { OfflineQueueStorageAdapter, QueuedRequest } from "../middleware/offlineQueue.js";

/**
 * Node.js specific FileSystem storage for the offline queue.
 * Persists requests to individual JSON files in a directory.
 */
export class FileSystemQueueStorageAdapter implements OfflineQueueStorageAdapter {
  constructor(private readonly dir: string) {}

  private async ensureDir() {
    await mkdir(this.dir, { recursive: true });
  }

  async push(item: QueuedRequest): Promise<void> {
    await this.ensureDir();
    const filePath = join(this.dir, `${item.id}.json`);
    await writeFile(filePath, JSON.stringify(item), "utf8");
  }

  async getAll(): Promise<readonly QueuedRequest[]> {
    try {
      await this.ensureDir();
      const files = await readdir(this.dir);
      const jsonFiles = files.filter((f: string) => f.endsWith(".json"));
      
      const results: QueuedRequest[] = [];
      for (const file of jsonFiles) {
        try {
          const content = await readFile(join(this.dir, file), "utf8");
          results.push(JSON.parse(content));
        } catch {
          // Skip malformed or unreadable files and continue loading valid entries.
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  async remove(id: number): Promise<void> {
    try {
      const filePath = join(this.dir, `${id}.json`);
      await unlink(filePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await readdir(this.dir);
      for (const file of files) {
        if (file.endsWith(".json")) {
           await unlink(join(this.dir, file));
        }
      }
    } catch {
      // Ignore
    }
  }

  async size(): Promise<number> {
    try {
      const files = await readdir(this.dir);
      return files.filter((f: string) => f.endsWith(".json")).length;
    } catch {
      return 0;
    }
  }
}
