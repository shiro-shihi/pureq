import type { DB } from "../core/db.js";
import { PUREQ_AST_SIGNATURE } from "../builder/builder.js";

export interface Migration {
  id: string;
  timestamp: number;
  up: (db: DB) => Promise<void>;
  down?: (db: DB) => Promise<void>;
}

export class MigrationManager {
  constructor(private readonly db: DB) {}

  async setup() {
    await this.db.driver.execute({ sql: `
      CREATE TABLE IF NOT EXISTS _pureq_migrations (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, __pureq_signature: PUREQ_AST_SIGNATURE });
  }

  async apply(migrations: Migration[]) {
    await this.setup();

    const applied = await this.db.driver.execute<{ id: string }>({
      sql: "SELECT id FROM _pureq_migrations ORDER BY timestamp ASC",
      __pureq_signature: PUREQ_AST_SIGNATURE
    });

    const appliedIds = new Set(applied.rows.map((r) => r.id));
    const toApply = migrations
      .filter((m) => !appliedIds.has(m.id))
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const m of toApply) {
      await this.db.driver.transaction(async () => {
        await m.up(this.db);
        await this.db.driver.execute(
          { sql: "INSERT INTO _pureq_migrations (id, timestamp) VALUES (?, ?)", __pureq_signature: PUREQ_AST_SIGNATURE },
          [m.id, m.timestamp]
        );
      });
    }

    return toApply.length;
  }

  async rollback(migrations: Migration[]) {
    await this.setup();

    const latest = await this.getLatestApplied();
    if (!latest) return 0;

    const migration = migrations.find(m => m.id === latest);
    if (!migration) {
      throw new Error(`Cannot rollback: migration ${latest} not found in provided list`);
    }

    if (!migration.down) {
      throw new Error(`Cannot rollback: migration ${latest} does not have a down() function`);
    }

    await this.db.driver.transaction(async () => {
      await migration.down!(this.db);
      await this.db.driver.execute(
        { sql: "DELETE FROM _pureq_migrations WHERE id = ?", __pureq_signature: PUREQ_AST_SIGNATURE },
        [migration.id]
      );
    });

    return 1;
  }

  async preview(migrations: Migration[]): Promise<string[]> {
    await this.setup();

    const applied = await this.db.driver.execute<{ id: string }>({
      sql: "SELECT id FROM _pureq_migrations ORDER BY timestamp ASC",
      __pureq_signature: PUREQ_AST_SIGNATURE
    });

    const appliedIds = new Set(applied.rows.map((r) => r.id));
    const toApply = migrations
      .filter((m) => !appliedIds.has(m.id))
      .sort((a, b) => a.timestamp - b.timestamp);

    return toApply.map(m => m.id);
  }

  async getLatestApplied(): Promise<string | null> {
    try {
      const result = await this.db.driver.execute<{ id: string }>({
        sql: "SELECT id FROM _pureq_migrations ORDER BY timestamp DESC LIMIT 1",
        __pureq_signature: PUREQ_AST_SIGNATURE
      });
      const latestApplied = result.rows[0];
      return latestApplied ? latestApplied.id : null;
    } catch {
      return null; // Table might not exist yet
    }
  }
}
