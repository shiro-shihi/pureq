import type { RequestConfig } from "../types/http";

function safeURL(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

export function keyByHost(req: Readonly<RequestConfig>): string {
  const parsed = safeURL(req.url);
  if (!parsed) {
    return `host:unknown:${req.method}`;
  }
  return `host:${parsed.host}`;
}

export function keyByMethodAndPath(req: Readonly<RequestConfig>): string {
  const parsed = safeURL(req.url);
  if (!parsed) {
    return `path:${req.method}:${req.url}`;
  }
  return `path:${req.method}:${parsed.pathname}`;
}

export function keyByOriginAndPath(req: Readonly<RequestConfig>): string {
  const parsed = safeURL(req.url);
  if (!parsed) {
    return `origin-path:${req.method}:${req.url}`;
  }
  return `origin-path:${req.method}:${parsed.origin}${parsed.pathname}`;
}
