/**
 * SCRAM-SHA-256 Implementation using standard Web Crypto API.
 * Zero dependencies. Compatible with Node.js, Cloudflare Workers, Deno, and Bun.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function generateNonce(length = 24): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return encodeBase64(bytes.buffer).replace(/[^a-zA-Z0-9]/g, '').substring(0, length);
}

async function hmacSha256(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const buffer = await crypto.subtle.sign("HMAC", key, data.buffer as ArrayBuffer);
  return new Uint8Array(buffer);
}

async function importHmacKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    rawKey.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function hi(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data.buffer as ArrayBuffer));
}

async function pbkdf2(password: Uint8Array, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    password.buffer as ArrayBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const buffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return new Uint8Array(buffer);
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  const res = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    res[i] = a[i]! ^ b[i]!;
  }
  return res;
}

export class ScramSha256 {
  private clientNonce: string;
  private serverNonce?: string;
  private salt?: Uint8Array;
  private iterations?: number;
  private clientFirstMessageBare: string;
  private serverFirstMessage?: string;
  private saltedPassword?: Uint8Array;
  private authMessage?: string;

  constructor(private user: string, private password: string) {
    this.clientNonce = generateNonce();
    this.clientFirstMessageBare = `n=${this.user},r=${this.clientNonce}`;
  }

  clientFirstMessage(): string {
    return `n,,${this.clientFirstMessageBare}`;
  }

  async clientFinalMessage(message: string): Promise<string> {
    this.serverFirstMessage = message;
    const parts = message.split(',');
    for (const part of parts) {
      if (part.startsWith('r=')) this.serverNonce = part.substring(2);
      if (part.startsWith('s=')) this.salt = decodeBase64(part.substring(2));
      if (part.startsWith('i=')) this.iterations = parseInt(part.substring(2), 10);
    }

    if (!this.serverNonce || !this.serverNonce.startsWith(this.clientNonce)) {
      throw new Error("Security Exception: Invalid SCRAM server nonce");
    }
    if (!this.salt || !this.iterations) {
      throw new Error("Security Exception: Invalid SCRAM server first message");
    }

    const clientFinalMessageWithoutProof = `c=biws,r=${this.serverNonce}`;
    this.authMessage = `${this.clientFirstMessageBare},${this.serverFirstMessage},${clientFinalMessageWithoutProof}`;

    this.saltedPassword = await pbkdf2(encoder.encode(this.password), this.salt, this.iterations);
    
    const clientKey = await hi(await importHmacKey(this.saltedPassword), encoder.encode("Client Key"));
    const storedKey = new Uint8Array(await crypto.subtle.digest("SHA-256", clientKey.buffer as ArrayBuffer));
    const clientSignature = await hi(await importHmacKey(storedKey), encoder.encode(this.authMessage));
    const clientProof = xor(clientKey, clientSignature);

    return `${clientFinalMessageWithoutProof},p=${encodeBase64(clientProof.buffer as ArrayBuffer)}`;
  }

  async verifyServerSignature(message: string): Promise<boolean> {
    const parts = message.split(',');
    let serverSignatureBase64 = "";
    for (const part of parts) {
      if (part.startsWith('v=')) serverSignatureBase64 = part.substring(2);
    }

    if (!this.saltedPassword || !this.authMessage) throw new Error("Security Exception: SCRAM state invalid");

    const serverKey = await hi(await importHmacKey(this.saltedPassword), encoder.encode("Server Key"));
    const expectedServerSignature = await hi(await importHmacKey(serverKey), encoder.encode(this.authMessage));
    
    return encodeBase64(expectedServerSignature.buffer as ArrayBuffer) === serverSignatureBase64;
  }
}
