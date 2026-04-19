import * as net from "node:net";
import * as tls from "node:tls";
import { type PureqSocket, type SocketOptions } from "./socket.js";

export class NodeSocket implements PureqSocket {
  private socket: net.Socket | tls.TLSSocket;
  private chunks: Uint8Array[] = [];
  private resolver?: ((chunk: Uint8Array) => void) | undefined;

  constructor(options: SocketOptions) {
    const connOptions = { host: options.host, port: options.port };
    this.socket = options.tls 
      ? tls.connect(connOptions) 
      : net.connect(connOptions);

    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on("data", (data) => {
      if (this.resolver) {
        this.resolver(data);
        this.resolver = undefined;
      } else {
        this.chunks.push(data);
      }
    });
  }

  async upgradeTls(options: tls.ConnectionOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.removeAllListeners("data");
      
      const tlsSocket = tls.connect({
        socket: this.socket as net.Socket,
        ...options
      });

      tlsSocket.on("secureConnect", () => {
        this.socket = tlsSocket;
        this.setupListeners();
        resolve();
      });

      tlsSocket.on("error", reject);
    });
  }

  async write(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async *read(): AsyncIterableIterator<Uint8Array> {
    while (true) {
      if (this.chunks.length > 0) {
        yield this.chunks.shift()!;
      } else {
        yield await new Promise<Uint8Array>((resolve) => {
          this.resolver = resolve;
        });
      }
    }
  }

  async close(): Promise<void> {
    this.socket.destroy();
  }
}
