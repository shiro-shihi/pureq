# Identity-Bound Signatures: Preventing BOLA & Replay

Pureq RPC uses a unique approach to request integrity: **Identity-Bound Signatures**. Every byte sent from the client is cryptographically linked to the specific user session.

## The Problem: Replay & Spoofing

In traditional APIs, if an attacker captures a valid request packet, they can often replay it. Even with JWTs, if a "Get User Data" request is predictable (e.g., `/api/user/123`), an attacker can easily iterate through IDs (Insecure Direct Object Reference - IDOR).

## The Pureq Solution: HMAC Binding

Every request in Pureq RPC contains an `HMAC-SHA256` signature generated using:

1. **The Session Secret:** A unique cryptographical key for the active user.
2. **The QueryId:** The stable hash of the authorized manifest query.
3. **The Parameters:** The specific values (e.g., `userId: 456`) being sent.

### Why this is mathematically secure

```typescript
Signature = HMAC(SessionSecret, QueryId + Params)
```

- **Anti-Theft:** If an attacker steals a valid signature from User A, they cannot use it. Why? Because User B has a different `SessionSecret`. The server will recalculate the HMAC using User B's secret, and the values won't match.
- **Anti-Tamper:** If an attacker tries to change a parameter (e.g., changing `userId: 456` to `userId: 1`), the `Params` part of the HMAC changes. The signature becomes invalid.
- **Anti-Replay:** Signatures are tied to the session life-cycle. Once the session secret expires, all previous signatures are permanently invalid.

## Constant-Time Verification

To prevent **Timing Attacks**, where an attacker guesses the signature by measuring response times, Pureq uses a constant-time comparison algorithm.

```typescript
// From runtime/shared/crypto.ts
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
```

This ensures that the server takes the exact same amount of time to reject a signature, regardless of how many characters the attacker guessed correctly.

## Implementation Details

Verification happens at the very first step of the `RpcHandler`, before any application logic or database access. This "Fast-Reject" layer protects your server's CPU and database from being wasted on unauthorized traffic.
