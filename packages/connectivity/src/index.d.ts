/**
 * @pureq/connectivity - The Universal TCP-to-WebStream Bridge
 *
 * 100% Zero-Dependency.
 * Supports: Node.js, Bun, Deno, Cloudflare Workers, and Browser (via Proxy).
 */
export interface PureqIO {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
}
/**
 * Pureq's internal Stream Controller.
 */
export declare class PureqStreamReader {
    private buffer;
    private reader;
    constructor(stream: ReadableStream<Uint8Array>);
    read(len: number): Promise<Uint8Array>;
    peek(len: number): Promise<Uint8Array | null>;
}
export declare class PureqStreamWriter {
    private writer;
    constructor(stream: WritableStream<Uint8Array>);
    write(data: Uint8Array): Promise<void>;
    close(): Promise<void>;
}
/**
 * The Universal Connector.
 * This is where Pureq "self-implements" platform support.
 */
export declare class PureqConnection {
    static connect(options: {
        host: string;
        port: number;
        tls?: boolean;
    }): Promise<PureqConnection>;
    reader: PureqStreamReader;
    writer: PureqStreamWriter;
    constructor(io: PureqIO);
}
