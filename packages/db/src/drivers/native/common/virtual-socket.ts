import * as fs from "node:fs/promises";
import { type PureqSocket } from "./socket.js";

/**
 * A Virtual Socket that enables "Zero-Infrastructure Testing" (Native Snapshot & Replay).
 * It records network traffic during a live run and replays it exactly without a real database.
 */
export class VirtualSocket implements PureqSocket {
  private replayChunks: Uint8Array[] = [];
  private recording: { type: "rx" | "tx", data: string }[] = [];
  
  constructor(
    private readonly mode: "record" | "replay",
    private readonly snapshotPath: string,
    private readonly realSocket?: PureqSocket
  ) {}

  async init(): Promise<void> {
    if (this.mode === "replay") {
      try {
        const content = await fs.readFile(this.snapshotPath, "utf-8");
        const parsed = JSON.parse(content);
        for (const item of parsed) {
          if (item.type === "rx") {
             // Decode base64 to Uint8Array
             const binary = atob(item.data);
             const bytes = new Uint8Array(binary.length);
             for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
             this.replayChunks.push(bytes);
          }
        }
      } catch (e) {
        throw new Error(`Failed to load virtual database snapshot from ${this.snapshotPath}`);
      }
    }
  }

  async write(data: Uint8Array): Promise<void> {
    if (this.mode === "record" && this.realSocket) {
      let binary = '';
      for (let i = 0; i < data.byteLength; i++) binary += String.fromCharCode(data[i]!);
      this.recording.push({ type: "tx", data: btoa(binary) });
      await this.realSocket.write(data);
    }
  }

  async *read(): AsyncIterableIterator<Uint8Array> {
    if (this.mode === "replay") {
      while (this.replayChunks.length > 0) {
        yield this.replayChunks.shift()!;
      }
      return;
    }

    if (this.mode === "record" && this.realSocket) {
      for await (const chunk of this.realSocket.read()) {
        let binary = '';
        for (let i = 0; i < chunk.byteLength; i++) binary += String.fromCharCode(chunk[i]!);
        this.recording.push({ type: "rx", data: btoa(binary) });
        yield chunk;
      }
    }
  }

  async close(): Promise<void> {
    if (this.mode === "record") {
      await fs.writeFile(this.snapshotPath, JSON.stringify(this.recording, null, 2), "utf-8");
    }
    if (this.realSocket) {
      await this.realSocket.close();
    }
  }
}
