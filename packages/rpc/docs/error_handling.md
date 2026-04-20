# Error Handling: Universal Normalization

In a binary protocol, handling errors can be tricky. Pureq RPC provides a **Universal Error Normalization** system that ensures errors are safe, performant, and type-safe.

## The Error Lifecycle

### 1. Server-Side Exception
When an error occurs in a procedure, the `RpcHandler` catches it. 
- **Security Check:** In production, the handler strips internal stack traces and database details to prevent **Information Leakage**.
- **Normalization:** The error is converted into a standard `PureqError` structure.

### 2. Binary Encoding (`TYPE_IDS.ERROR`)
The error is encoded into the binary stream using the special tag `0x63`. 
- **Efficiency:** We only encode the message and a standardized Error Code, keeping the payload small.

### 3. Client-Side Reconstruction
When the **Hyper-Codec** sees the `0x63` tag, it automatically instantiates a new JavaScript `Error` (or a subclass) in your frontend.

```typescript
try {
  await client.getUser({ id: -1 });
} catch (e) {
  console.error(e.message); // "User not found"
  console.log(e instanceof Error); // true
}
```

## Security Best Practices

### A. Don't Leak DB Details
Pureq RPC automatically masks database-specific error messages (like `duplicate key value violates unique constraint "users_email_key"`) into generic, safe messages unless you are in `devMode`.

### B. Standard Error Codes
We use bitwise-efficient error codes (2-byte integers) for common issues:
- `0x01`: Authentication Failed
- `0x02`: Invalid Request Signature
- `0x03`: Manifest Violation (Unauthorized Query)
- `0x04`: Validation Failed

## Development Mode (Transparency)
If `options.devMode` is enabled on the client, the server will send the full original error (including stack traces if possible) to help you debug. This is automatically disabled in production.
