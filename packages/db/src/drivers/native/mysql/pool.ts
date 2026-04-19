import { MysqlNativeDriver, type MysqlNativeConfig } from "./driver.js";
import type { Driver, QueryResult, QueryPayload } from "../../types.js";

export interface MysqlPoolOptions {
  maxSize: number;
  idleTimeoutMs: number;
}

export class NativeMysqlPool implements Driver {
  private pool: MysqlNativeDriver[] = [];
  private activeCount = 0;
  private queue: ((driver: MysqlNativeDriver) => void)[] = [];

  constructor(
    private config: MysqlNativeConfig,
    private options: MysqlPoolOptions = { maxSize: 10, idleTimeoutMs: 30000 }
  ) {}

  async execute<T = unknown>(query: QueryPayload, params: unknown[] = []): Promise<QueryResult<T>> {
    const driver = await this.acquire();
    try {
      return await driver.execute<T>(query, params);
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

  private async acquire(): Promise<MysqlNativeDriver> {
    if (this.pool.length > 0) {
      this.activeCount++;
      return this.pool.pop()!;
    }

    if (this.activeCount < this.options.maxSize) {
      this.activeCount++;
      const driver = new MysqlNativeDriver(this.config);
      return driver;
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(driver: MysqlNativeDriver) {
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
