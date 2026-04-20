/**
 * @pureq/connectivity - The Universal TCP-to-WebStream Bridge
 *
 * 100% Zero-Dependency.
 * Supports: Node.js, Bun, Deno, Cloudflare Workers, and Browser (via Proxy).
 */
/**
 * Pureq's internal Stream Controller.
 */
export class PureqStreamReader {
    buffer = new Uint8Array(0);
    reader;
    constructor(stream) {
        this.reader = stream.getReader();
    }
    async read(len) {
        while (this.buffer.length < len) {
            const { value, done } = await this.reader.read();
            if (done)
                throw new Error("Stream closed prematurely.");
            if (value) {
                const next = new Uint8Array(this.buffer.length + value.length);
                next.set(this.buffer);
                next.set(value, this.buffer.length);
                this.buffer = next;
            }
        }
        const result = this.buffer.slice(0, len);
        this.buffer = this.buffer.slice(len);
        return result;
    }
    async peek(len) {
        return this.buffer.length < len ? null : this.buffer.slice(0, len);
    }
}
export class PureqStreamWriter {
    writer;
    constructor(stream) {
        this.writer = stream.getWriter();
    }
    async write(data) { await this.writer.write(data); }
    async close() { await this.writer.close(); }
}
/**
 * The Universal Connector.
 * This is where Pureq "self-implements" platform support.
 */
export class PureqConnection {
    static async connect(options) {
        const g = globalThis;
        // 1. Deno Support
        if (typeof g.Deno !== "undefined") {
            const conn = await g.Deno.connect({ hostname: options.host, port: options.port });
            return new PureqConnection({ readable: conn.readable, writable: conn.writable });
        }
        // 2. Bun Support
        if (typeof g.Bun !== "undefined") {
            const socket = await g.Bun.connect({
                hostname: options.host, port: options.port,
                socket: { data(s, data) { }, open(s) { }, close(s) { }, error(s, e) { } }
            });
            // Bun sockets can be converted to web streams
            return new PureqConnection({ readable: socket.readable, writable: socket.writable });
        }
        // 3. Cloudflare Workers (TCP Socket API)
        if (typeof g.navigator !== "undefined" && g.navigator.userAgent === "Cloudflare-Workers") {
            const { connect } = await import("cloudflare:sockets");
            const socket = connect({ hostname: options.host, port: options.port });
            return new PureqConnection({ readable: socket.readable, writable: socket.writable });
        }
        // 4. Node.js (Full-scratch Adapter for net.Socket)
        // We dynamically import node:net to keep the top-level clean.
        const net = await import("node:net").catch(() => null);
        if (net) {
            const socket = net.connect(options.port, options.host);
            // We implement the Node-to-WebStream conversion ourselves (Full Scratch)
            const readable = new ReadableStream({
                start(controller) {
                    socket.on("data", (chunk) => controller.enqueue(chunk));
                    socket.on("end", () => controller.close());
                    socket.on("error", (err) => controller.error(err));
                },
                cancel() { socket.destroy(); }
            });
            const writable = new WritableStream({
                write(chunk) { return new Promise((res, rej) => socket.write(chunk, (err) => err ? rej(err) : res())); },
                close() { return new Promise((res) => socket.end(res)); }
            });
            return new PureqConnection({ readable, writable });
        }
        throw new Error("Pureq: No compatible TCP runtime found.");
    }
    reader;
    writer;
    constructor(io) {
        this.reader = new PureqStreamReader(io.readable);
        this.writer = new PureqStreamWriter(io.writable);
    }
}
