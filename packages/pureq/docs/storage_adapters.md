# Storage Adapters

Storage adapters allow **pureq** features like the `offlineQueue` to persist data across page reloads and browser restarts. This document explains the storage interface and the built-in adapters available.

## The Adapter Interface

If you need to store data in a custom location (e.g., Redis, SQLite, or a specific cloud store), you can implement the `OfflineQueueStorageAdapter` interface.

```ts
export interface OfflineQueueStorageAdapter {
  /** Add a request to the end of the queue */
  push(item: QueuedRequest): Promise<void>;
  
  /** Retrieve all queued requests in order */
  getAll(): Promise<readonly QueuedRequest[]>;
  
  /** Remove a specific request by ID */
  remove(id: number): Promise<void>;
  
  /** Clear the entire queue */
  clear(): Promise<void>;
  
  /** Get the current number of items in the queue */
  size(): Promise<number>;
}
```

---

## Built-in Adapters

### IndexedDBQueueStorageAdapter (Browser)

The standard adapter for web applications. It uses the browser's IndexedDB to ensure that mutation requests are not lost even if the user closes the tab before they can be replayed.

```ts
import { IndexedDBQueueStorageAdapter, createOfflineQueue } from "@pureq/pureq";

const storage = new IndexedDBQueueStorageAdapter("my-app-db");
const queue = createOfflineQueue({ storage });
```

### FileSystemQueueStorageAdapter (Node.js)

For server-side applications or CLI tools, this adapter persists the queue as a local file.

```ts
// Note: This must be imported from the 'pureq/node' subpath
import { FileSystemQueueStorageAdapter } from "@pureq/pureq/node";

const storage = new FileSystemQueueStorageAdapter("./offline-queue.json");
```

---

## Security: Encrypted Storage

For enterprise-grade applications handling sensitive data, **pureq** provides a wrapper that encrypts the queue at rest using AES-GCM (via the Web Crypto API).

```ts
import { 
  IndexedDBQueueStorageAdapter, 
  EncryptedQueueStorageAdapter 
} from "@pureq/pureq";

const baseStorage = new IndexedDBQueueStorageAdapter();

// Initialize the encrypted wrapper with a CryptoKey
const encryptedStorage = new EncryptedQueueStorageAdapter(baseStorage, myCryptoKey);

const queue = createOfflineQueue({ storage: encryptedStorage });
```

### Key Management

The `EncryptedQueueStorageAdapter` requires a `CryptoKey` from the Web Crypto API. You are responsible for generating and securely storing this key (e.g., using a password-derived key or the browser's Key Management system).

---

## Best Practices

1. **Idempotency**: Always use the `idempotencyKey()` middleware alongside a durable offline queue to prevent accidental duplicate actions on the server during replay.
2. **Size Limits**: While IndexedDB can store large amounts of data, it is good practice to monitor the queue size and handle "out of storage" errors gracefully.
3. **Atomic Operations**: Built-in adapters handle basic transaction safety, but if you implement a custom adapter for a distributed system, ensure it supports atomic `push` and `remove` operations to prevent data loss.
