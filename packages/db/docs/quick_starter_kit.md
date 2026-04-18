# Quick Starter Kit (Minimal Setup)

This is the absolute minimum configuration to get `@pureq/db` running with SQLite.

## 1. Project Setup

```bash
mkdir my-pureq-db-app && cd my-pureq-db-app
npm init -y
pnpm add @pureq/db @pureq/validation better-sqlite3
```

## 2. The Entire Code (`index.ts`)

```typescript
import { table, column, DB, BetterSqlite3Driver } from "@pureq/db";
import Database from "better-sqlite3";

// 1. Initialize
const sqlite = new Database(":memory:");
const db = new DB(new BetterSqlite3Driver(sqlite));

// 2. Define
const users = table("users", {
  id: column.number().primary(),
  name: column.string(),
});

// 3. Setup Table
sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

// 4. Run!
async function main() {
  await db.insert(users).values({ id: 1, name: "Pureq" }).execute();
  
  const result = await db.select().from(users).execute();
  console.log(result);
}

main();
```

## 3. Run

```bash
node --loader ts-node/esm index.ts
```
