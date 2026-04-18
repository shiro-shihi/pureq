# Drivers and Adapters

`@pureq/db` uses an adapter-based architecture, allowing it to support a wide range of database engines.

## Supported Native Drivers

- **`PostgresDriver`**: For PostgreSQL. Requires the `pg` library.
- **`BetterSqlite3Driver`**: For SQLite. Requires the `better-sqlite3` library.

## Initializing a Driver

### PostgreSQL

```typescript
import { DB, PostgresDriver } from "@pureq/db";
import { Client } from "pg";

const pg = new Client();
const db = new DB(new PostgresDriver(pg));
```

### SQLite

```typescript
import { DB, BetterSqlite3Driver } from "@pureq/db";
import Database from "better-sqlite3";

const sqlite = new Database("my.db");
const db = new DB(new BetterSqlite3Driver(sqlite));
```

## Creating a Custom Driver

To support a new database, implement the `Driver` interface:

```typescript
import { Driver, QueryResult } from "@pureq/db";

class MyCustomDriver implements Driver {
  async execute<T>(sql: string, params: unknown[]): Promise<QueryResult<T>> {
    // Implementation here
  }

  async transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    // Implementation here
  }
}
```
