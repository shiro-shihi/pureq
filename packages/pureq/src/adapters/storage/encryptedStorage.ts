import type { OfflineQueueStorageAdapter, QueuedRequest } from "../../middleware/offlineQueue";
import { encrypt, decrypt } from "../../utils/crypto";

interface EncryptedQueuedRequest extends Omit<QueuedRequest, "req"> {
  readonly req: string;
}

let decryptionErrorCounter = 0;

function createDecryptionErrorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  decryptionErrorCounter += 1;
  return `decrypt-${Date.now()}-${decryptionErrorCounter}`;
}

/**
 * A wrapper for OfflineQueueStorageAdapter that encrypts request data at rest.
 * Crucial for enterprise compliance when storing PII or auth tokens in local storage.
 */
export class EncryptedQueueStorageAdapter implements OfflineQueueStorageAdapter {
  constructor(
    private readonly inner: OfflineQueueStorageAdapter,
    private readonly key: CryptoKey
  ) {}

  async push(item: QueuedRequest): Promise<void> {
    const encryptedReq = await encrypt(JSON.stringify(item.req), this.key);

    await this.inner.push({
      ...item,
      req: encryptedReq,
    } as unknown as QueuedRequest);
  }

  async getAll(): Promise<readonly QueuedRequest[]> {
    const rawItems = await this.inner.getAll();
    const results: QueuedRequest[] = [];
    const failures: {
      readonly index: number;
      readonly id: number;
      readonly errorId: string;
      readonly code: "DECRYPTION_FAILURE";
      readonly name: string;
    }[] = [];

    for (let index = 0; index < rawItems.length; index++) {
      const item = rawItems[index]! as QueuedRequest;
      try {
        if (typeof item.req !== "string") {
          throw new Error("encrypted req payload is not a string");
        }

        const decryptedReqJson = await decrypt(item.req, this.key);
        const decryptedReq = JSON.parse(decryptedReqJson);

        const encryptedItem = item as unknown as EncryptedQueuedRequest;
        results.push({
          id: encryptedItem.id,
          queuedAt: encryptedItem.queuedAt,
          ...(encryptedItem.expiresAt !== undefined ? { expiresAt: encryptedItem.expiresAt } : {}),
          req: decryptedReq,
        });
      } catch (error) {
        const errorId = createDecryptionErrorId();
        const safeName = error instanceof Error ? error.name : "UnknownError";
        console.warn(`pureq: failed to decrypt queued request - errorId=${errorId} code=DECRYPTION_FAILURE name=${safeName}`);
        failures.push({
          index,
          id: item.id,
          errorId,
          code: "DECRYPTION_FAILURE",
          name: safeName,
        });
      }
    }

    if (failures.length > 0) {
      const aggregate = new AggregateError(
        failures,
        `pureq: failed to decrypt ${failures.length} queued request(s)`
      ) as AggregateError & {
        readonly details?: typeof failures;
        readonly code?: string;
      };
      (aggregate as { details: typeof failures }).details = failures;
      (aggregate as { code: string }).code = "PUREQ_DECRYPTION_FAILURE";
      throw aggregate;
    }

    return results;
  }

  async remove(id: number): Promise<void> {
    await this.inner.remove(id);
  }

  async clear(): Promise<void> {
    await this.inner.clear();
  }

  async size(): Promise<number> {
    return this.inner.size();
  }
}
