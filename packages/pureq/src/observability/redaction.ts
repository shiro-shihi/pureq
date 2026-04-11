export interface RedactionOptions {
  readonly redactedValue?: string;
  readonly sensitiveHeaderNames?: readonly string[];
  readonly sensitiveFieldPatterns?: readonly RegExp[];
}

const defaultSensitiveHeaders = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
];

const defaultSensitiveFieldPatterns = [/token/i, /secret/i, /password/i, /api[-_]?key/i];

/**
 * Redacts sensitive header values while preserving keys.
 */
export function redactHeaders(
  headers: Readonly<Record<string, string>>,
  options: RedactionOptions = {}
): Readonly<Record<string, string>> {
  const redactedValue = options.redactedValue ?? "[REDACTED]";
  const sensitive = new Set(
    (options.sensitiveHeaderNames ?? defaultSensitiveHeaders).map((key) => key.toLowerCase())
  );

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = sensitive.has(key.toLowerCase()) ? redactedValue : value;
  }

  return result;
}

/**
 * Redacts sensitive object fields by key pattern.
 */
export function redactObjectFields<T extends Readonly<Record<string, unknown>>>(
  value: T,
  options: RedactionOptions = {}
): T {
  const redactedValue = options.redactedValue ?? "[REDACTED]";
  const patterns = options.sensitiveFieldPatterns ?? defaultSensitiveFieldPatterns;

  const result: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    const sensitive = patterns.some((pattern) => pattern.test(key));
    result[key] = sensitive ? redactedValue : fieldValue;
  }

  return result as T;
}

/**
 * Standard PII (Personally Identifiable Information) Redaction Profile.
 * Redacts common PII field names like email, phone, ssn, address.
 */
export const piiRedactionOptions: RedactionOptions = {
  sensitiveFieldPatterns: [
    /email/i,
    /phone/i,
    /ssn/i,
    /social.?security/i,
    /address/i,
    /credit.?card/i,
    /dob/i,
    /date.?of.?birth/i,
  ],
};

/**
 * Standard Auth Redaction Profile.
 * Extends the default auth redaction with stricter keys and patterns.
 */
export const authRedactionOptions: RedactionOptions = {
  sensitiveHeaderNames: [
    ...defaultSensitiveHeaders,
    "x-amz-security-token",
    "x-goog-api-key",
  ],
  sensitiveFieldPatterns: [
    ...defaultSensitiveFieldPatterns,
    /client.?secret/i,
    /access.?token/i,
    /refresh.?token/i,
    /auth/i,
  ],
};

/**
 * Default query parameter names considered sensitive in URLs.
 */
const defaultSensitiveQueryParams = [
  "token",
  "key",
  "api_key",
  "apiKey",
  "apikey",
  "secret",
  "password",
  "access_token",
  "refresh_token",
  "client_secret",
];

export interface UrlRedactionOptions {
  readonly redactedValue?: string;
  readonly sensitiveParams?: readonly string[];
}

/**
 * Redacts sensitive query parameters from a URL string.
 * Useful for preventing secret leakage via telemetry/logging.
 *
 * @example
 * ```ts
 * redactUrlQueryParams("https://api.example.com/v1?token=secret123&page=1")
 * // => "https://api.example.com/v1?token=[REDACTED]&page=1"
 * ```
 */
export function redactUrlQueryParams(
  url: string,
  options: UrlRedactionOptions = {}
): string {
  const redactedValue = options.redactedValue ?? "[REDACTED]";
  const sensitiveParams = new Set(
    (options.sensitiveParams ?? defaultSensitiveQueryParams).map((p) => p.toLowerCase())
  );

  try {
    const parsed = new URL(url);
    let redacted = false;

    for (const key of [...parsed.searchParams.keys()]) {
      if (sensitiveParams.has(key.toLowerCase())) {
        parsed.searchParams.set(key, redactedValue);
        redacted = true;
      }
    }

    return redacted ? parsed.toString() : url;
  } catch {
    // If the URL is not parseable (e.g. relative path), return as-is
    return url;
  }
}
