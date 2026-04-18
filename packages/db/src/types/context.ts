export interface QueryContext {
  scopes?: string[];
  userId?: string | number;
  role?: string;
  [key: string]: unknown;
}
