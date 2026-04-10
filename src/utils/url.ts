/**
 * Utility for extracting path parameters from a template string.
 * Supports patterns like "/users/:id" or "/users/:userId/posts/:postId".
 */
export type ExtractParams<T extends string> =
  string extends T
    ? Record<string, string>
    : T extends `${infer _Start}/:${infer Param}/${infer Rest}`
      ? { [K in CleanParam<Param> | keyof ExtractParams<`/${Rest}`>]: string }
      : T extends `${infer _Start}/:${infer Param}`
        ? { [K in CleanParam<Param>]: string }
        : {};

type CleanParam<P extends string> =
  P extends `${infer Name}?${string}`
    ? Name
    : P extends `${infer Name}#${string}`
      ? Name
      : P;

/**
 * Type-safe request options based on the URL path.
 * Forces the user to provide correct parameters for a given URL template.
 */
export interface TypedRequestOptions<Path extends string> {
  readonly params: ExtractParams<Path>;
  readonly query?: Readonly<Record<string, string | string[]>>;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}
