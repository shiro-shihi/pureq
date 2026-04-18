export interface QueryResult<T = unknown> {
  rows: T[];
  affectedRows?: number;
  lastInsertId?: string | number;
}

export interface Driver {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T>;
}

export interface EdgeDriver extends Driver {
  // Edge drivers often have specific features like batching or different HTTP options
  batch?(queries: { sql: string; params?: unknown[] }[]): Promise<QueryResult[]>;
}
