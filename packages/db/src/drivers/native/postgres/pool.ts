import { PostgresNativeDriver, type PostgresNativeConfig } from "./driver.js";
import type { Driver, QueryResult } from "../../types.js";

export interface PoolOptions {
  maxSize: number;
  idleTimeoutMs: number;
}

export class NativePool implements Driver {
  private pool: PostgresNativeDriver[] = [];
  private activeCount = 0;
  private queue: ((driver: PostgresNativeDriver) => void)[] = [];

  constructor(
    private config: PostgresNativeConfig,
    private options: PoolOptions = { maxSize: 10, idleTimeoutMs: 30000 }
  ) {}

  async execute<T = unknown>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const driver = await this.acquire();
    try {
      return await driver.execute<T>(sql, params);
    } finally {
      this.release(driver);
    }
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    const driver = await this.acquire();
    try {
      return await driver.transaction(fn);
    } finally {
      this.release(driver);
    }
  }

  /**
   * Provides a mechanism to listen to notifications from any connection in the pool.
   * Note: This picks a random connection and keeps it alive for LISTEN.
   */
  async listen(channel: string, callback: (payload: string) => void): Promise<() => void> {
    const driver = await this.acquire();
    // This is a bit simplified. In a real pool, LISTEN connections are usually 
    // separate from the general pool because they are "busy" forever.
    await driver.execute(`LISTEN ${channel}`);
    // Driver needs to expose the connection's notification listener
    // This part requires driver/connection exposure refactoring
    return () => {
        driver.execute(`UNLISTEN ${channel}`).finally(() => this.release(driver));
    };
  }

  private async acquire(): Promise<PostgresNativeDriver> {
    if (this.pool.length > 0) {
      this.activeCount++;
      return this.pool.pop()!;
    }

    if (this.activeCount < this.options.maxSize) {
      this.activeCount++;
      const driver = new PostgresNativeDriver(this.config);
      return driver;
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(driver: PostgresNativeDriver) {
    this.activeCount--;
    const waiter = this.queue.shift();
    if (waiter) {
      this.activeCount++;
      waiter(driver);
    } else {
      this.pool.push(driver);
    }
  }

  async end(): Promise<void> {
    await Promise.all(this.pool.map(d => d.close()));
    this.pool = [];
  }
}
