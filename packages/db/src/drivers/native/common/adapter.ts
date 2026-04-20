/**
 * Pureq Universal Connectivity Adapter
 * Bridges platform-specific sockets to Pureq IO Primitives.
 */
import { PureqReader, PureqWriter, PureqIOBuffer } from "./io.js";

export class PureqSocketAdapter implements PureqReader, PureqWriter {
  private buffer = new PureqIOBuffer();
  private resolver: (() => void) | null = null;

  constructor(private rawSocket: { 
    write: (data: Uint8Array) => Promise<void> | void,
    onData: (callback: (data: Uint8Array) => void) => void 
  }) {
    this.rawSocket.onData((data) => {
      this.buffer.append(data);
      if (this.resolver) {
        this.resolver();
        this.resolver = null;
      }
    });
  }

  async read(len: number): Promise<Uint8Array> {
    while (this.buffer.length < len) {
      await new Promise<void>((resolve) => {
        this.resolver = resolve;
      });
    }
    return this.buffer.consume(len);
  }

  async readRemaining(): Promise<Uint8Array> {
    return this.buffer.consume(this.buffer.length);
  }

  async write(data: Uint8Array): Promise<void> {
    await this.rawSocket.write(data);
  }
}
