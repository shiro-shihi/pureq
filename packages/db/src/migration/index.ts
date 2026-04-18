import type { DB } from "../core/db.js";

export interface Migration {
  id: string;
  timestamp: number;
  up: (db: DB) => Promise<void>;
  down?: (db: DB) => Promise<void>;
}

export class MigrationManager {
  constructor(private readonly db: DB) {}

  async setup() {
    await this.db.driver.execute(`
      CREATE TABLE IF NOT EXISTS _pureq_migrations (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async apply(migrations: Migration[]) {
    await this.setup();

    const applied = await this.db.driver.execute<{ id: string }>(
      "SELECT id FROM _pureq_migrations ORDER BY timestamp ASC"
    );

    const appliedIds = new Set(applied.rows.map((r) => r.id));
    const toApply = migrations
      .filter((m) => !appliedIds.has(m.id))
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const m of toApply) {
      await this.db.driver.transaction(async () => {
        await m.up(this.db);
        await this.db.driver.execute(
          "INSERT INTO _pureq_migrations (id, timestamp) VALUES (?, ?)",
          [m.id, m.timestamp]
        );
      });
    }

    return toApply.length;
  }

  async getLatestApplied(): Promise<string | null> {
    const result = await this.db.driver.execute<{ id: string }>(
      "SELECT id FROM _pureq_migrations ORDER BY timestamp DESC LIMIT 1"
    );
    const latestApplied = result.rows[0];
    return latestApplied ? latestApplied.id : null;
  }
}
