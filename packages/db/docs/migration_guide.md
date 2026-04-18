# Migration Guide

Database migrations are managed through the `MigrationManager`.

## Defining Migrations

A migration is an object with a unique `id` and an `up` function.

```typescript
import { Migration } from "@pureq/db";

const initMigration: Migration = {
  id: "20240101_init",
  async up(db) {
    await db.driver.execute(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
  }
};
```

## Running Migrations

Instantiate the `MigrationManager` and call `apply`.

```typescript
import { MigrationManager } from "@pureq/db";

const manager = new MigrationManager(db);
await manager.apply([initMigration, nextMigration]);
```

## How it Works

1. **Setup**: The manager creates a `_pureq_migrations` table to track applied changes.
2. **Check**: It queries this table to see which migrations have already run.
3. **Execution**: It runs pending migrations in order. Each migration is wrapped in a database transaction to ensure atomicity.
4. **Tracking**: Upon success, it records the migration ID in the tracking table.
