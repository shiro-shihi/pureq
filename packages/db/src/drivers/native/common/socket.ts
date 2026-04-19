/**
 * High-performance Buffer Reader using a chunk queue to avoid 
 * repetitive memory allocations and copying.
 */
export class BufferReader {
  private chunks: Uint8Array[] = [];
  private totalLength = 0;
  private offset = 0;

  append(data: Uint8Array) {
    this.chunks.push(data);
    this.totalLength += data.length;
  }

  get length() { return this.totalLength - this.offset; }

  /**
   * Peek bytes without consuming. Avoids allocation if possible.
   */
  peek(bytes: number): Uint8Array | null {
    if (this.length < bytes) return null;
    
    // If the peeked range is entirely within the first chunk, return a view
    const firstChunk = this.chunks[0]!;
    const availableInFirst = firstChunk.length - this.offset;
    if (availableInFirst >= bytes) {
      return firstChunk.subarray(this.offset, this.offset + bytes);
    }

    // Fallback: merge necessary chunks (rare for small peeks like headers)
    return this.copyToNewBuffer(bytes);
  }

  /**
   * Consume and return bytes. Returns a view (subarray) if possible to avoid copying.
   */
  consume(bytes: number): Uint8Array {
    if (this.length < bytes) throw new Error("Buffer underflow");

    const firstChunk = this.chunks[0]!;
    const availableInFirst = firstChunk.length - this.offset;

    // Zero-copy optimization: if requested bytes are within the current chunk, return a view
    if (availableInFirst >= bytes) {
      const result = firstChunk.subarray(this.offset, this.offset + bytes);
      this.offset += bytes;
      if (this.offset >= firstChunk.length) {
        this.chunks.shift();
        this.offset = 0;
      }
      this.totalLength -= bytes;
      return result;
    }

    // Fallback: merge necessary chunks (copying required)
    const result = new Uint8Array(bytes);
    let remaining = bytes;
    let resultOffset = 0;

    while (remaining > 0) {
      const chunk = this.chunks[0]!;
      const available = chunk.length - this.offset;
      const toCopy = Math.min(available, remaining);

      result.set(chunk.subarray(this.offset, this.offset + toCopy), resultOffset);

      remaining -= toCopy;
      resultOffset += toCopy;
      this.offset += toCopy;

      if (this.offset >= chunk.length) {
        this.chunks.shift();
        this.offset = 0;
      }
    }

    this.totalLength -= bytes;
    return result;
  }

  private copyToNewBuffer(bytes: number): Uint8Array {
    const result = new Uint8Array(bytes);
    let resultOffset = 0;
    let chunksIdx = 0;
    let currentOffset = this.offset;

    while (resultOffset < bytes) {
      const chunk = this.chunks[chunksIdx]!;
      const available = chunk.length - currentOffset;
      const toCopy = Math.min(available, bytes - resultOffset);
      result.set(chunk.subarray(currentOffset, currentOffset + toCopy), resultOffset);
      resultOffset += toCopy;
      currentOffset = 0;
      chunksIdx++;
    }
    return result;
  }
}

export interface SocketOptions {
  host: string;
  port: number;
  tls?: boolean;
}

export interface PureqSocket {
  write(data: Uint8Array): Promise<void>;
  read(): AsyncIterableIterator<Uint8Array>;
  upgradeTls?(options: any): Promise<void>;
  close(): Promise<void>;
}
