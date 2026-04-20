# Binary Protocol Specification: The Hyper-Codec

Pureq RPC uses a custom, bit-packed binary protocol designed for high throughput and zero memory fragmentation.

## Design Goals

1. **Instruction-Level Efficiency:** Use bit-shifting instead of DataView where possible.
2. **Zero-Allocation:** Reusable memory slabs to minimize GC pressure.
3. **Universality:** Identical behavior across Node.js, V8, and Browser.

## Type Identifiers (TYPE_IDS)

Every value in the binary stream begins with a 1-byte **Type Tag**.

| Tag (Hex) | Type | Description |
| :--- | :--- | :--- |
| `0x00` | NULL | Represents `null` or `undefined`. |
| `0x01` | BOOL | 1-byte value (0 for false, 1 for true). |
| `0x02` | INT | 4-byte Signed Integer (Little-Endian). |
| `0x03` | FLOAT | 8-byte IEEE 754 Float (Little-Endian). |
| `0x04` | STRING | 4-byte Length + UTF-8 Data. |
| `0x05` | DATE | 8-byte Double (Milliseconds since epoch). |
| `0x06` | OBJECT | 4-byte Property Count + Key/Value Pairs. |
| `0x07` | ARRAY | 4-byte Element Count + Recursive Values. |
| `0x08` | BUFFER | 4-byte Length + Raw Binary Data. |
| `0x63` | ERROR | Normalized error object with message string. |

## Memory Management: The Slab Allocator

To prevent "Micro-Allocations" during serialization, Pureq uses a **Slab**.

- A single `Uint8Array` (default 1MB) is pre-allocated.
- All bitwise operations write directly into this buffer.
- The buffer is reset (offset = 0) at the start of every request.
- *Result:* No garbage is created during the build phase of an RPC packet.

## Framing Specification

### Request Frame

1. **Magic Header:** 4 bytes (`0x50 0x52 0x51 0x01`).
2. **QueryId:** Encoded as a STRING (TYPE_ID 4).
3. **Signature:** Encoded as a STRING (TYPE_ID 4).
4. **Params:** Encoded as a native type (usually OBJECT or ARRAY).

### Response Frame

1. **Status Byte:** `0x00` for Success, `0x01` for Error.
2. **Payload:** Encoded JS Value or Normalized Error.

## Performance Optimization (V8 Fast-Path)

The decoder uses bitwise operators (`|`, `<<`) to assemble integers directly from the byte array. This allows the V8 JIT compiler to generate the most optimal machine code (using raw CPU registers) compared to the standard `DataView.getInt32()` which includes alignment and bounds checks.
