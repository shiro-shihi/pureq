# AuthKit Quickstart (Alpha)

`createAuthKit` is the integration-first entrypoint for `@pureq/auth`.

It bundles:

- core route handlers
- session manager and storage wiring
- React/Vue session integration helpers

## Basic setup

```ts
import { createAuthKit, credentialsProvider, createInMemoryAdapter } from "@pureq/auth";
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
  security: {
    mode: "ssr-bff", // "browser-spa" | "ssr-bff" | "edge"
  },
  providers: [
    credentialsProvider({
      authorize: async (credentials) => {
        return verifyPassword(credentials.username, credentials.password);
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
