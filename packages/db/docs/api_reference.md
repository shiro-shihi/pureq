# API Reference

## Schema DSL

### `table(name: string, columns: Record<string, ColumnBuilder>)`

Defines a database table.

### `column.*()`

Column type builders:

- `string()`
- `number()`
- `boolean()`
- `uuid()`
- `date()`
- `json()`

#### Column Methods

- `.primary()`: Mark as primary key.
- `.nullable()`: Allow `null` values.
- `.default(value: any)`: Set a default value.
- `.policy(options: ValidationPolicy)`: Define security and validation policies.

## Type Inference

- `InferSelect<TTable>`: Derives the TypeScript type for a `SELECT` result.
- `InferInsert<TTable>`: Derives the TypeScript type for an `INSERT` payload.

## Query Builder

### `SelectBuilder`

Methods:

- `.from(table: Table)`
- `.select(columns: (string | Expression)[] | "*")`
- `.innerJoin(alias: string, table: Table, on: (cols) => Expression)`
- `.where(column: string | Expression, operator: string, value: any)`
- `.orderBy(column: string, direction: "ASC" | "DESC")`
- `.limit(limit: number)`
- `.offset(offset: number)`
- `.validate()`: Enables result validation via `@pureq/validation`.
- `.withContext(context: QueryContext)`: Injects user context for RLS/CLS.
- `.execute()`: Compiles and runs the query.

### `InsertBuilder`

Methods:

- `.values(data: InferInsert<TTable>)`
- `.execute()`

### `UpdateBuilder`

Methods:

- `.set(data: Partial<InferSelect<TTable>>)`
- `.where(column: string | Expression, operator: string, value: any)`
- `.execute()`

### `DeleteBuilder`

Methods:

- `.where(column: string | Expression, operator: string, value: any)`
- `.execute()`

## Validation Bridge

### `toValidationSchema(table: Table)`

Converts a DB table definition into a `@pureq/validation` `ObjectSchema`.

## Drivers

- `PostgresDriver(client)`: Driver for PostgreSQL.
- `SqliteDriver(db)`: Driver for SQLite via `better-sqlite3`.
- `D1Driver(db)`: Edge driver for Cloudflare D1.
- `NeonHttpDriver(client)`: Edge driver for Neon HTTP.
- `PlanetScaleDriver(client)`: Edge driver for PlanetScale.

## Migrations

### `MigrationManager(db: DB)`

Manages database schema versioning and execution.

#### Methods

- `.apply(migrations: Migration[])`: Runs pending migrations in a transaction.
- `.setup()`: Ensures the migration tracking table exists.
- `.rollback(migrations: Migration[])`: Reverts the last applied migration.
- `.preview(migrations: Migration[])`: Returns a list of pending migration IDs.

## Observability

- `DB(driver, diagnostics)`: Inject custom `Diagnostics` for tracing.
- `DefaultDiagnostics`: Default no-op implementation of diagnostics.
