# OIDC Claims Mapping & Zero-Trust Verification

Pureq Auth uses a strict **Zero-Trust Identity** model. This document details how identity claims are verified, mapped, and validated during the OIDC callback flow.

## Trust Model

The core principle is **Server-to-Server Verification**. Pureq Auth never trusts identity information (email, user ID, etc.) passed through URL parameters during a callback. 

### Identity Chain of Custody
1. **Authorization Code:** The only value accepted from the client/browser is the `code` and `state`.
2. **Backchannel Exchange:** Pureq Auth exchanges the `code` for a `token_set` directly with the provider (e.g., Google, GitHub).
3. **Verified Claims:** Identity is extracted from the cryptographically verified `id_token` or via a secure `userinfo` endpoint call using the new `access_token`.
4. **Pure Mapping:** The verified raw profile is passed to the `mapProfile` hook.

## The `mapProfile` Hook

The `mapProfile` hook is a pure function that transforms raw provider-specific data into your application's internal user format.

### Example: GitHub Provider

```ts
new GithubProvider({
  clientId: process.env.GITHUB_ID,
  clientSecret: process.env.GITHUB_SECRET,
  mapProfile: (profile: GithubProfile) => {
    // Identity here is GUARANTEED to be verified by GitHub
    return {
      id: profile.id.toString(),
      email: profile.email,
      name: profile.name ?? profile.login,
      avatarUrl: profile.avatar_url,
    };
  }
})
```

## Security Controls

### 1. Removal of Insecure Fallbacks
Earlier versions or mock implementations might fall back to `user@example.com` if an email was missing. **Pureq Auth now fails the authentication** if required identity claims (like email) are missing from the verified provider response.

### 2. Schema Validation
You can enforce your own schema using the `profileSchema` option in `AuthConfig`. This happens *after* mapping but *before* the database adapter is called.

```ts
const auth = createAuth({
  profileSchema: t.record({
    id: t.string(),
    email: t.string().email(),
    name: t.string().min(1),
  }),
  // ...
});
```

### 3. Session Hardening
Upon successful verification, Pureq generates a 32-byte secure random session token. This token is independent of the User ID, preventing session enumeration and hijacking.

## Implementation Details in `core`

The `handleCallback` handler in `@pureq/auth/core` performs the following steps:
1. Validates the presence of `code` and `provider`.
2. Initializes an `OIDCFlow` for the specific provider.
3. Performs the exchange and retrieves the **Verified Profile**.
4. Executes the `mapProfile` hook.
5. Runs `profileSchema.parse()` if configured.
6. Calls `adapter.linkAccount` and `adapter.createSession` using the verified data.
