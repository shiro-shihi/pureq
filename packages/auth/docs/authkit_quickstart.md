# AuthKit Quickstart (Alpha)

`createAuthKit` is the integration-first entrypoint for `@pureq/auth`.

It bundles:

- core route handlers
- session manager and storage wiring
- React/Vue session integration helpers

## Basic setup

```ts
import { createAuthKit, credentialsProvider, passkeyProvider, createInMemoryAdapter } from "@pureq/auth";
import { verify } from "argon2";

async function verifyPassword(username: string, password: string) {
  const user = await db.user.findUnique({ where: { username } });
  if (!user) {
    return null;
  }

  const ok = await verify(user.passwordHash, password);
  return ok ? { id: user.id, email: user.email } : null;
}

const authKit = createAuthKit({
  adapter: createInMemoryAdapter(),
  adapterReadiness: {
    requirePasskeySupport: true,
  },
  security: {
    mode: "ssr-bff", // "browser-spa" | "ssr-bff" | "edge"
  },
  providers: [
    credentialsProvider({
      authorize: async (credentials) => {
        return verifyPassword(credentials.username, credentials.password);
      },
    }),
    passkeyProvider({
      rpId: "app.example.com",
      expectedOrigin: "https://app.example.com",
      // WARNING: Placeholder verification below is intentionally strict-fail by default.
      // Do not ship to production without full WebAuthn attestation/assertion verification.
      // Reference: packages/auth/docs/auth_package.md (Passkey/WebAuthn section).
      verifyRegistration: async ({ response, expectedChallenge, expectedOrigin, expectedRpId, user }) => {
        const registrationResponse = response as { id?: string; rawId?: string } | null;
        const hasCredentialId =
          !!registrationResponse &&
          (typeof registrationResponse.id === "string" || typeof registrationResponse.rawId === "string");

        if (!hasCredentialId || !expectedChallenge || !expectedOrigin || !expectedRpId || !user.id) {
          return { verified: false };
        }

        // TODO: Replace with server-side attestation verification (origin, rpId, challenge, signature, counter).
        return { verified: false };
      },
      verifyAuthentication: async ({ response, expectedChallenge, expectedOrigin, expectedRpId, authenticator }) => {
        const authenticationResponse = response as { id?: string; rawId?: string } | null;
        const assertionCredentialId = authenticationResponse?.rawId ?? authenticationResponse?.id;

        if (
          typeof assertionCredentialId !== "string" ||
          !expectedChallenge ||
          !expectedOrigin ||
          !expectedRpId ||
          !authenticator.credentialId
        ) {
          return { verified: false };
        }

        // TODO: Replace with server-side assertion verification and sign-counter validation.
        return { verified: false };
      },
    }),
  ],
});
```

Use `argon2`, `bcrypt`, or `scrypt` for password verification. Avoid plaintext string comparison in `authorize`.

## Route wiring

```ts
// sign-in providers and sign-in POST
await authKit.handlers.handleSignIn(requestLike);

// callback flow
await authKit.handlers.handleCallback(requestLike);

// current session
await authKit.handlers.handleSession(requestLike);

// sign out
await authKit.handlers.handleSignOut(requestLike);
```

## Client session store

```ts
const sessionStore = authKit.createSessionStore();
await sessionStore.refresh();
console.log(sessionStore.getSnapshot());
```

## React helper

```ts
const hooks = authKit.createReactHooks(useSyncExternalStore);
const session = hooks.useAuthSession();
```

## Vue helper

```ts
const useAuthSession = authKit.createVueSessionComposable(runtimeBindings);
const session = useAuthSession();
```

## Notes

- This is an alpha integration API and may evolve.
- Advanced customization remains available via low-level `createAuth`, presets, and standalone hooks.
- If you override security defaults, use `security.onPolicyOverride` to track deviations from recommended mode defaults.
- When enabling Passkey/WebAuthn in production, set `adapterReadiness.requirePasskeySupport: true` in your auth config (or your adapter factory config if your adapter wrapper exposes it there).
- For readiness option details, see [adapter_compatibility_matrix.md](./adapter_compatibility_matrix.md).
