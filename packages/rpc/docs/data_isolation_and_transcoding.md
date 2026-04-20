# Data Isolation: Bitwise Transcoding & Masking

Pureq RPC ensures that sensitive data never leaves your server by moving security from the application layer down to the physical buffer layer.

## The Bitwise Transcoding Engine

Unlike traditional frameworks that convert database results to JSON, Pureq uses a **Binary Transcoder**. It performs a direct, byte-for-byte re-mapping of database wire packets (PG/MySQL) into the Pureq RPC binary format.

### Performance Delta
- **Traditional:** DB Binary -> JS Object -> JSON String -> JS Object.
- **Pureq:** DB Binary -> RPC Binary. (Zero intermediate JS objects).

## Physical Masking (Security by Construction)

The most critical feature of the Transcoder is **Physical Masking**. As the engine scans the raw database packet, it refers to the **Manifest Whitelist**.

1. It identifies a byte segment for a column.
2. If the column name is in the manifest, the bytes are **copied** to the RPC response.
3. If not (e.g., `password_hash`), the bytes are **physically skipped**.

### Absolute Protection
Because the Transcoder operates at the bit-level, unauthorized data **physically never enters** the network buffer. It is structurally impossible to "accidentally" leak a field that wasn't explicitly selected in your `defineManifest` query.

## Reliability
This mechanism fulfills the **Least Privilege** principle automatically. Developers don't need to remember to `omit()` fields; the engine does it at the wire level based on your static query definition.
