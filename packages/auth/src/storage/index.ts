import type { AuthStore } from "../shared/index.js";
import { base64Encode, base64Decode } from "../shared/index.js";

function getGlobalStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    const storage = globalThis[kind];
    if (!storage) {
      return null;
    }
    const testKey = "__pureq_auth_probe__";
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return storage;
  } catch {
    return null;
  }
}

function createMemoryBacking(): { accessToken: string | null; refreshToken: string | null } {
  return { accessToken: null, refreshToken: null };
}

function createDualStore(
  readAccess: () => Promise<string | null> | string | null,
  writeAccess: (token: string) => Promise<void> | void,
  clearAccess: () => Promise<void> | void,
  readRefresh: () => Promise<string | null> | string | null,
  writeRefresh: (token: string) => Promise<void> | void,
  clearRefresh: () => Promise<void> | void
): AuthStore {
  return {
    async get() {
      return await readAccess();
    },
    async set(token: string) {
      await writeAccess(token);
    },
    async clear() {
      await clearAccess();
    },
    async getRefresh() {
      return await readRefresh();
    },
    async setRefresh(token: string) {
      await writeRefresh(token);
    },
    async clearRefresh() {
      await clearRefresh();
    },
  };
}

function createWebStorage(kind: "localStorage" | "sessionStorage", prefix = ""): AuthStore {
  const storage = getGlobalStorage(kind);
  const accessKey = `${prefix}accessToken`;
  const refreshKey = `${prefix}refreshToken`;
  const memory = createMemoryBacking();

  const read = (key: keyof typeof memory) => async () => {
    if (!storage) {
      return memory[key];
    }

    return storage.getItem(key === "accessToken" ? accessKey : refreshKey);
  };

  const write = (key: keyof typeof memory) => async (token: string) => {
    if (!storage) {
      memory[key] = token;
      return;
    }

    storage.setItem(key === "accessToken" ? accessKey : refreshKey, token);
  };

  const clear = (key: keyof typeof memory) => async () => {
    if (!storage) {
      memory[key] = null;
      return;
    }

    storage.removeItem(key === "accessToken" ? accessKey : refreshKey);
  };

  return createDualStore(
    read("accessToken"),
    write("accessToken"),
    clear("accessToken"),
    read("refreshToken"),
    write("refreshToken"),
    clear("refreshToken")
  );
}

/** Default cookie max-age: 30 days. */
const DEFAULT_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface CookieConfig {
  readonly prefix: string;
  readonly path: string;
  readonly sameSite: "lax" | "strict" | "none";
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly domain?: string;
  readonly maxAgeSeconds: number;
}

function createCookieOptions(options: {
  readonly prefix?: string;
  readonly path?: string;
  readonly sameSite?: "lax" | "strict" | "none";
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
  readonly domain?: string;
  readonly maxAgeSeconds?: number;
} = {}): CookieConfig {
  return {
    prefix: options.prefix ?? "",
    path: options.path ?? "/",
    sameSite: options.sameSite ?? "lax",
    secure: options.secure ?? true,
    httpOnly: options.httpOnly ?? true,
    ...(options.domain !== undefined ? { domain: options.domain } : {}),
    maxAgeSeconds: options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS,
  };
}

function getCookieString(): string {
  if (typeof document === "undefined") {
    return "";
  }

  return document.cookie;
}

function setCookie(name: string, value: string, options: CookieConfig): void {
  if (typeof document === "undefined") {
    return;
  }

  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`, `Path=${options.path}`, `SameSite=${options.sameSite}`];
  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }
  if (options.secure) {
    parts.push("Secure");
  }
  // SEC-C3: HttpOnly by default
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  parts.push(`Max-Age=${options.maxAgeSeconds}`);

  document.cookie = parts.join("; ");
}

function clearCookie(name: string, options: CookieConfig): void {
  if (typeof document === "undefined") {
    return;
  }

  const parts = [`${encodeURIComponent(name)}=`, `Path=${options.path}`, `SameSite=${options.sameSite}`, "Max-Age=0"];
  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }
  if (options.secure) {
    parts.push("Secure");
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  document.cookie = parts.join("; ");
}

function readCookie(name: string): string | null {
  const cookieString = getCookieString();
  if (!cookieString) {
    return null;
  }

  const encodedName = `${encodeURIComponent(name)}=`;
  for (const part of cookieString.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(encodedName)) {
      return decodeURIComponent(trimmed.slice(encodedName.length));
    }
  }

  return null;
}

/** In-memory token store (no persistence). */
export function authMemoryStore(): AuthStore {
  const memory = createMemoryBacking();

  return {
    async get() {
      return memory.accessToken;
    },
    async set(token: string) {
      memory.accessToken = token;
    },
    async clear() {
      memory.accessToken = null;
    },
    async getRefresh() {
      return memory.refreshToken;
    },
    async setRefresh(token: string) {
      memory.refreshToken = token;
    },
    async clearRefresh() {
      memory.refreshToken = null;
    },
  };
}

/** 
 * Browser localStorage-backed token store. 
 * ⚠️ WARNING: Vulnerable to XSS. Use authCookieStore() in production for better security.
 */
export function authLocalStorage(options: { readonly prefix?: string } = {}): AuthStore {
  return createWebStorage("localStorage", options.prefix ?? "");
}

/** 
 * Browser sessionStorage-backed token store. 
 * ⚠️ WARNING: Vulnerable to XSS. Use authCookieStore() in production for better security.
 */
export function authSessionStorage(options: { readonly prefix?: string } = {}): AuthStore {
  return createWebStorage("sessionStorage", options.prefix ?? "");
}

/** Browser cookie-backed token store. HttpOnly and Secure are enabled by default. */
export function authCookieStore(options: {
  readonly prefix?: string;
  readonly path?: string;
  readonly sameSite?: "lax" | "strict" | "none";
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
  readonly domain?: string;
  readonly maxAgeSeconds?: number;
} = {}): AuthStore {
  const cookieOptions = createCookieOptions(options);
  const accessKey = `${cookieOptions.prefix}accessToken`;
  const refreshKey = `${cookieOptions.prefix}refreshToken`;
  const fallback = createMemoryBacking();

  return {
    async get() {
      return readCookie(accessKey) ?? fallback.accessToken;
    },
    async set(token: string) {
      fallback.accessToken = token;
      setCookie(accessKey, token, cookieOptions);
    },
    async clear() {
      fallback.accessToken = null;
      clearCookie(accessKey, cookieOptions);
    },
    async getRefresh() {
      return readCookie(refreshKey) ?? fallback.refreshToken;
    },
    async setRefresh(token: string) {
      fallback.refreshToken = token;
      setCookie(refreshKey, token, cookieOptions);
    },
    async clearRefresh() {
      fallback.refreshToken = null;
      clearCookie(refreshKey, cookieOptions);
    },
  };
}

/**
 * Custom token store with user-provided get/set/clear callbacks.
 * DX-M3: getRefresh defaults to returning null (not access token) when not provided.
 */
export function authCustomStore(options: {
  readonly get: () => Promise<string | null> | string | null;
  readonly set: (token: string) => Promise<void> | void;
  readonly clear: () => Promise<void> | void;
  readonly getRefresh?: () => Promise<string | null> | string | null;
  readonly setRefresh?: (token: string) => Promise<void> | void;
  readonly clearRefresh?: () => Promise<void> | void;
}): AuthStore {
  return {
    async get() {
      return await options.get();
    },
    async set(token: string) {
      await options.set(token);
    },
    async clear() {
      await options.clear();
    },
    async getRefresh() {
      return options.getRefresh ? await options.getRefresh() : null;
    },
    async setRefresh(token: string) {
      if (options.setRefresh) {
        await options.setRefresh(token);
      }
    },
    async clearRefresh() {
      if (options.clearRefresh) {
        await options.clearRefresh();
      }
    },
  };
}

/** Hybrid store: delegates access token and refresh token to separate stores. */
export function authHybridStore(options: {
  readonly accessToken: AuthStore;
  readonly refreshToken: AuthStore;
}): AuthStore {
  return {
    async get() {
      return options.accessToken.get();
    },
    async set(token: string) {
      await options.accessToken.set(token);
    },
    async clear() {
      await options.accessToken.clear();
    },
    async getRefresh() {
      return options.refreshToken.get();
    },
    async setRefresh(token: string) {
      await options.refreshToken.set(token);
    },
    async clearRefresh() {
      await options.refreshToken.clear();
    },
  };
}

/**
 * Wraps an inner AuthStore with AES-GCM encryption for at-rest token protection (FEAT-M6).
 * Uses Web Crypto API — zero dependencies.
 */
export function authEncryptedStore(inner: AuthStore, encryptionKey: string): AuthStore {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const deriveKey = async (): Promise<CryptoKey> => {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(encryptionKey),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: encoder.encode("pureq-auth-encrypted-store"), iterations: 100_000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  };

  let cachedKey: CryptoKey | null = null;
  const getKey = async (): Promise<CryptoKey> => {
    if (!cachedKey) {
      cachedKey = await deriveKey();
    }
    return cachedKey;
  };

  const encrypt = async (plaintext: string): Promise<string> => {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(plaintext)
    );
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return base64Encode(String.fromCharCode(...combined));
  };

  const decrypt = async (ciphertext: string): Promise<string> => {
    const key = await getKey();
    const combined = Uint8Array.from(base64Decode(ciphertext), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    return decoder.decode(decrypted);
  };

  const safeDecrypt = async (value: string | null): Promise<string | null> => {
    if (!value) {
      return null;
    }
    try {
      return await decrypt(value);
    } catch {
      return null;
    }
  };

  return {
    async get() {
      return safeDecrypt(await inner.get());
    },
    async set(token: string) {
      await inner.set(await encrypt(token));
    },
    async clear() {
      await inner.clear();
    },
    async getRefresh() {
      return safeDecrypt(await inner.getRefresh());
    },
    async setRefresh(token: string) {
      await inner.setRefresh(await encrypt(token));
    },
    async clearRefresh() {
      await inner.clearRefresh();
    },
  };
}
