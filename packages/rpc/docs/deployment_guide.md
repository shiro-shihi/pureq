# Deployment Guide: Production Hardening

Deploying `@pureq/rpc` to production requires a focus on **Secret Management** and **Environment Configuration**.

## 1. SSL/TLS is Mandatory

Because Pureq RPC relies on the native transport layer for payload privacy (No double-encryption), **HTTPS is required**.
- **Edge Functions:** Usually handle SSL/TLS automatically (Cloudflare, Vercel).
- **Node.js:** Ensure your server is behind a reverse proxy (Nginx, Traefik) that terminates SSL correctly.

## 2. Session Secret Management

The `sessionSecret` is the core of your Identity-Bound security.
- **Never Hardcode:** Use Environment Variables or Secret Managers (e.g., Cloudflare Secrets).
- **Per-User Secret:** Ideally, the secret should be unique to the user session (stored in your session DB/KV) rather than a single global app secret.
- **Rotation:** Rotate global secrets every 30-90 days.

## 3. Runtime Optimizations

### Cloudflare Workers
Ensure you use the **TCP Socket API** if connecting directly to a database.
```javascript
// wrangler.toml
[node_compat] = false # Keep it pure
```

### Node.js
If using a high-concurrency Node.js server, increase the default `PureqIOBuffer` slab size to accommodate your largest expected response.

## 4. Monitoring & Observability

### Security Alerts
Monitor for `Security Violation` (403 Forbidden) logs. A spike in these indicates:
1. An expired session being replayed.
2. An attempted BOLA/IDOR attack.
3. A client-side bug in signature generation.

### Performance Tracking
Track the `content-length` of your binary responses. If they grow unexpectedly large (>16MB), the server will automatically drop the connection to protect memory.

## 5. Secret Rotation Strategy
When rotating your `sessionSecret`:
1. Deploy the new secret to the server.
2. Existing clients will fail signature verification.
3. Handle the `403` error by redirecting the user to re-login, which generates a new session and fetches the new secret.
