/**
 * Pureq Universal IO Primitives
 * 
 * A zero-dependency async buffer management system that works everywhere.
 */

export interface PureqReader {
  read(len: number): Promise<Uint8Array>;
  readRemaining(): Promise<Uint8Array>;
}

export interface PureqWriter {
  write(data: Uint8Array): Promise<void>;
}

/**
 * High-performance, zero-copy buffer queue.
 */
export class PureqIOBuffer {
  private chunks: Uint8Array[] = [];
  private totalLength = 0;

  append(chunk: Uint8Array) {
    this.chunks.push(chunk);
    this.totalLength += chunk.length;
  }

  get length() { return this.totalLength; }

  consume(bytes: number): Uint8Array {
    if (this.totalLength < bytes) throw new Error("Buffer underflow");
    
    const result = new Uint8Array(bytes);
    let offset = 0;
    while (offset < bytes) {
      const first = this.chunks[0]!;
      const remainingNeeded = bytes - offset;
      
      if (first.length <= remainingNeeded) {
        result.set(first, offset);
        offset += first.length;
        this.chunks.shift();
      } else {
        result.set(first.subarray(0, remainingNeeded), offset);
        this.chunks[0] = first.subarray(remainingNeeded);
        offset += remainingNeeded;
      }
    }
    this.totalLength -= bytes;
    return result;
  }
}
