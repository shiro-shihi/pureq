import type { Driver } from "../drivers/types.js";

export interface Migration {
  id: string;
  sql: string;
  timestamp: number;
}

export class MigrationManager {
  constructor(private readonly driver: Driver) {}

  async init() {
    await this.driver.execute(`
      CREATE TABLE IF NOT EXISTS _pureq_migrations (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async apply(migrations: Migration[]) {
    await this.init();

    const applied = await this.driver.execute<{ id: string }>(
      "SELECT id FROM _pureq_migrations ORDER BY timestamp ASC"
    );

    const appliedIds = new Set(applied.rows.map((r) => r.id));
    const toApply = migrations
      .filter((m) => !appliedIds.has(m.id))
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const m of toApply) {
      await this.driver.transaction(async (tx) => {
        await tx.execute(m.sql);
        await tx.execute(
          "INSERT INTO _pureq_migrations (id, timestamp) VALUES ($1, $2)",
          [m.id, m.timestamp]
        );
      });
    }

    return toApply.length;
  }

  async getLatestApplied(): Promise<string | null> {
    const result = await this.driver.execute<{ id: string }>(
      "SELECT id FROM _pureq_migrations ORDER BY timestamp DESC LIMIT 1"
    );
    const latestApplied = result.rows[0];
    return latestApplied ? latestApplied.id : null;
  }
}
