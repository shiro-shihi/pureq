import { run, bench, group } from "mitata";
import { PostgresNativeDriver } from "../src/drivers/native/postgres/driver.js";
import { PUREQ_AST_SIGNATURE } from "../src/builder/builder.js";
import { type PureqSocket } from "../src/drivers/native/common/socket.js";

/**
 * REAL-WORLD SCENARIO BENCHMARK: Latency & Pipelining
 * 
 * This benchmark simulates an Edge runtime connecting to a remote DB
 * with 20ms of round-trip latency.
 */

class LatencySocket implements PureqSocket {
  constructor(private latencyMs: number) {}
  async write(data: Uint8Array) {
    // Simulate network delay for sending
    await new Promise(r => setTimeout(resolve => r(resolve), this.latencyMs / 2));
  }
  async *read(): AsyncIterableIterator<Uint8Array> {
    // Simulate network delay for receiving
    await new Promise(r => setTimeout(resolve => r(resolve), this.latencyMs / 2));
    // Yield a minimal "ReadyForQuery" (Z) message to satisfy the driver loop
    yield new Uint8Array([90, 0, 0, 0, 5, 73]); 
  }
  async close() {}
}

// Custom Driver that uses our LatencySocket
class LatencyPostgresDriver extends PostgresNativeDriver {
  private customConnection?: any;

  constructor(config: any, private latencyMs: number) {
    super(config);
  }
  
  protected async getConnection(): Promise<any> {
    if (this.customConnection) return this.customConnection;
    const socket = new LatencySocket(this.latencyMs);
    const { PgConnection } = await import("../src/drivers/native/postgres/pg-connection.js");
    this.customConnection = new PgConnection(socket, this.config as any);
    this.customConnection.isConnected = true; // Skip handshake for bench
    return this.customConnection;
  }
}

const latencyDriver = new LatencyPostgresDriver({
  host: "remote-db", port: 5432, user: "u", database: "d"
}, 20); // 20ms RTT

group("Network Efficiency (20ms RTT Latency)", () => {
  bench("@pureq/db: Pipelined (1 RTT for 3 queries)", async () => {
    // Uses the executeBatch which sends messages in a single packet
    await latencyDriver.executeBatch([
      { query: { sql: "SELECT 1", __pureq_signature: PUREQ_AST_SIGNATURE }, params: [] },
      { query: { sql: "SELECT 2", __pureq_signature: PUREQ_AST_SIGNATURE }, params: [] },
      { query: { sql: "SELECT 3", __pureq_signature: PUREQ_AST_SIGNATURE }, params: [] },
    ]);
  });

  bench("Legacy Driver: Sequential (3 RTTs for 3 queries)", async () => {
    // Simulates what pg/mysql2 do: one by one
    await latencyDriver.execute({ sql: "SELECT 1", __pureq_signature: PUREQ_AST_SIGNATURE }, []);
    await latencyDriver.execute({ sql: "SELECT 2", __pureq_signature: PUREQ_AST_SIGNATURE }, []);
    await latencyDriver.execute({ sql: "SELECT 3", __pureq_signature: PUREQ_AST_SIGNATURE }, []);
  });
});

await run();
