import type { Middleware, RequestConfig } from "@pureq/pureq";

// ────────────────────────────────────────────────────────────────────────────
// Core data models (FEAT-H2)
// ────────────────────────────────────────────────────────────────────────────

/** Represents a user in the auth system. */
export interface AuthUser {
	readonly id: string;
	readonly email?: string | null;
	readonly emailVerified?: Date | null;
	readonly name?: string | null;
	readonly image?: string | null;
}

/** Represents an OAuth/credentials account linked to a user. */
export interface AuthAccount {
	readonly userId: string;
	readonly type: "oauth" | "oidc" | "credentials" | "email";
	readonly provider: string;
	readonly providerAccountId: string;
	readonly accessToken?: string | null;
	readonly refreshToken?: string | null;
	readonly expiresAt?: number | null;
	readonly tokenType?: string | null;
	readonly scope?: string | null;
	readonly idToken?: string | null;
}

/** Represents a persisted session record. */
export interface AuthPersistedSession {
	readonly sessionToken: string;
	readonly userId: string;
	readonly expiresAt: Date;
}

/** Represents a verification token for email sign-in / password reset. */
export interface AuthVerificationToken {
	readonly identifier: string;
	readonly token: string;
	readonly expiresAt: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// Database adapter (FEAT-H1)
// ────────────────────────────────────────────────────────────────────────────

/** Pluggable persistence layer for users, accounts, sessions, and verification tokens. */
export interface AuthDatabaseAdapter {
	createUser(user: Omit<AuthUser, "id">): Promise<AuthUser>;
	getUser(id: string): Promise<AuthUser | null>;
	getUserByEmail(email: string): Promise<AuthUser | null>;
	getUserByAccount(provider: string, providerAccountId: string): Promise<AuthUser | null>;
	updateUser(user: Partial<AuthUser> & { readonly id: string }): Promise<AuthUser>;
	deleteUser?(id: string): Promise<void>;
	linkAccount(account: AuthAccount): Promise<AuthAccount>;
	unlinkAccount?(provider: string, providerAccountId: string): Promise<void>;
	createSession(session: AuthPersistedSession): Promise<AuthPersistedSession>;
	getSessionAndUser(sessionToken: string): Promise<{ readonly session: AuthPersistedSession; readonly user: AuthUser } | null>;
	updateSession(session: Partial<AuthPersistedSession> & { readonly sessionToken: string }): Promise<AuthPersistedSession | null>;
	deleteSession(sessionToken: string): Promise<void>;
	createVerificationToken?(token: AuthVerificationToken): Promise<AuthVerificationToken | null>;
	useVerificationToken?(params: { readonly identifier: string; readonly token: string }): Promise<AuthVerificationToken | null>;
}

// ────────────────────────────────────────────────────────────────────────────
// Providers (FEAT-H3)
// ────────────────────────────────────────────────────────────────────────────

/** Base provider definition. */
export interface AuthProvider {
	readonly id: string;
	readonly type: "oauth" | "oidc" | "credentials" | "email";
	readonly name: string;
}

/** Options for credentials-based sign-in. */
export interface AuthCredentialsProviderOptions {
	readonly id?: string;
	readonly name?: string;
	readonly authorize: (credentials: Readonly<Record<string, string>>) => Promise<AuthUser | null>;
}

/** Options for email / magic-link sign-in. */
export interface AuthEmailProviderOptions {
	readonly id?: string;
	readonly name?: string;
	readonly sendVerificationRequest: (params: {
		readonly identifier: string;
		readonly url: string;
		readonly token: string;
	}) => Promise<void>;
}

// ────────────────────────────────────────────────────────────────────────────
// Auth lifecycle callbacks (FEAT-H5)
// ────────────────────────────────────────────────────────────────────────────

/** Hooks at key auth lifecycle points. */
export interface AuthCallbacks {
	readonly signIn?: (params: {
		readonly user: AuthUser;
		readonly account: AuthAccount;
		readonly profile?: unknown;
	}) => boolean | Promise<boolean>;
	readonly signOut?: (params: {
		readonly session: AuthPersistedSession;
		readonly token?: unknown;
	}) => void | Promise<void>;
	readonly createUser?: (params: { readonly user: AuthUser }) => void | Promise<void>;
	readonly linkAccount?: (params: {
		readonly user: AuthUser;
		readonly account: AuthAccount;
	}) => void | Promise<void>;
	readonly session?: (params: {
		readonly session: AuthPersistedSession;
		readonly user: AuthUser;
		readonly token?: unknown;
	}) => AuthPersistedSession | Promise<AuthPersistedSession>;
	readonly jwt?: (params: {
		readonly token: unknown;
		readonly user?: AuthUser;
		readonly account?: AuthAccount;
	}) => unknown | Promise<unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// Token storage
// ────────────────────────────────────────────────────────────────────────────

export interface AuthStore {
	get(): Promise<string | null>;
	set(token: string): Promise<void>;
	clear(): Promise<void>;
	getRefresh(): Promise<string | null>;
	setRefresh(token: string): Promise<void>;
	clearRefresh(): Promise<void>;
}

// ────────────────────────────────────────────────────────────────────────────
// Middleware options
// ────────────────────────────────────────────────────────────────────────────

export interface AuthBearerOptions {
	readonly getToken: (req?: Readonly<RequestConfig>) => Promise<string | null> | string | null;
	readonly header?: string;
	readonly formatValue?: (token: string) => string;
	readonly validate?: (token: string) => boolean | Promise<boolean>;
}

export interface AuthRefreshOptions {
	readonly triggerStatus?: number;
	readonly refresh: (req: Readonly<RequestConfig>) => Promise<string>;
	readonly updateRequest?: (req: RequestConfig, newToken: string) => RequestConfig;
	readonly getRefreshScopeKey?: (req: Readonly<RequestConfig>) => string;
	readonly maxAttempts?: number;
	readonly onSuccess?: (newToken: string) => Promise<void> | void;
	readonly onFailure?: (error: Error) => Promise<void> | void;
}

export interface TokenLifecycleOptions {
	readonly storage: AuthStore;
	readonly refreshThresholdMs?: number;
	readonly onRefreshNeeded: () => Promise<string>;
	readonly onStale?: () => void;
	readonly onExpired?: () => void;
}

export interface AuthBasicOptions {
	readonly username: string | (() => Promise<string> | string);
	readonly password: string | (() => Promise<string> | string);
	readonly header?: string;
}

export interface AuthCustomOptions {
	readonly header?: {
		readonly name: string;
		readonly value: string | (() => Promise<string> | string);
	};
	readonly queryParam?: {
		readonly name: string;
		readonly value: string | (() => Promise<string> | string);
	};
}

export interface BroadcastSyncOptions {
	readonly channel?: string;
	readonly onRemoteRefresh: (newToken: string) => void | Promise<void>;
}

// ────────────────────────────────────────────────────────────────────────────
// Token / OIDC types
// ────────────────────────────────────────────────────────────────────────────

export interface TokenResponse {
	readonly accessToken: string;
	readonly idToken?: string;
	readonly refreshToken?: string;
	readonly tokenType?: string;
	readonly expiresIn?: number;
	readonly scope?: string;
	readonly raw?: unknown;
}

export interface OIDCAuthorizationOptions {
	readonly scope?: readonly string[];
	readonly state?: string;
	readonly nonce?: string;
	readonly prompt?: string;
	readonly codeChallenge?: string;
	readonly codeChallengeMethod?: "plain" | "S256";
	readonly extraParams?: Readonly<Record<string, string>>;
}

/** Result of getAuthorizationUrl — includes all values the caller must persist. */
export interface OIDCAuthorizationResult {
	readonly url: string;
	readonly state: string;
	readonly codeVerifier: string;
	readonly nonce: string;
}

export type OIDCTokenEndpointAuthMethod = "client_secret_basic" | "client_secret_post";

export interface OIDCFlowOptions {
	readonly clientId: string;
	readonly discoveryUrl: string;
	readonly redirectUri: string;
	readonly clientSecret?: string;
	readonly defaultScope?: readonly string[];
	readonly tokenEndpointAuthMethod?: OIDCTokenEndpointAuthMethod;
}

export interface OIDCFlow {
	getAuthorizationUrl(options?: OIDCAuthorizationOptions): Promise<OIDCAuthorizationResult>;
	exchangeCode(code: string, options: { readonly codeVerifier: string }): Promise<TokenResponse>;
	exchangeCallback(
		callback: string | URL | URLSearchParams,
		options: { readonly expectedState?: string; readonly codeVerifier: string; readonly expectedNonce?: string }
	): Promise<TokenResponse>;
	refresh(refreshToken: string): Promise<TokenResponse>;
	getUserInfo?(accessToken: string): Promise<Readonly<Record<string, unknown>>>;
	getLogoutUrl?(options?: { readonly idTokenHint?: string; readonly postLogoutRedirectUri?: string }): Promise<string>;
	introspect?(token: string): Promise<Readonly<Record<string, unknown>>>;
}

export interface OIDCProviderDefinition {
	readonly name: string;
	readonly discoveryUrl: string;
	readonly defaultScope?: readonly string[];
	readonly authorizationDefaults?: Readonly<Record<string, string>>;
	readonly validateAuthorizationOptions?: (options: OIDCAuthorizationOptions) => void;
}

export interface OIDCCallbackParams {
	readonly code: string;
	readonly state?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Session types
// ────────────────────────────────────────────────────────────────────────────

export interface AuthTokens {
	readonly accessToken: string;
	readonly refreshToken?: string;
}

export interface AuthSessionState {
	readonly accessToken: string | null;
	readonly refreshToken: string | null;
	readonly expiresAt?: number;
	readonly fingerprint?: string;
}

export type AuthTokenRotationPolicy =
	| "preserve-refresh-token"
	| "clear-refresh-token"
	| "require-refresh-token";

export interface AuthSessionEvent {
	readonly type:
		| "tokens-updated"
		| "tokens-cleared"
		| "session-refreshed"
		| "session-refresh-failed"
		| "session-logout"
		| "session-regenerated";
	readonly at: number;
	readonly source: "local" | "remote";
	readonly state?: AuthSessionState;
	readonly reason?: string;
	readonly errorMessage?: string;
}

export type AuthSessionEventListener = (event: AuthSessionEvent) => void | Promise<void>;

export type AuthSessionEventAudit = (event: AuthSessionEvent) => void | Promise<void>;

export interface AuthSessionEventExporter {
	export(event: AuthSessionEvent): void | Promise<void>;
	flush?(): Promise<void>;
	dispose?(): void;
}

export interface AuthSessionManagerOptions {
	readonly rotationPolicy?: AuthTokenRotationPolicy;
	readonly broadcastChannel?: string;
	readonly broadcastSecret?: string;
	readonly auditEvent?: AuthSessionEventAudit;
	readonly exporter?: AuthSessionEventExporter;
	readonly instanceId?: string;
	readonly minRefreshIntervalMs?: number;
	readonly slidingWindowMs?: number;
	readonly idleTimeoutMs?: number;
	readonly fingerprint?: (req?: Readonly<RequestConfig>) => string;
}

export interface AuthSessionManager {
	getState(): Promise<AuthSessionState>;
	setTokens(tokens: AuthTokens): Promise<void>;
	rotateTokens(tokens: AuthTokens, policy?: AuthTokenRotationPolicy): Promise<AuthSessionState>;
	clear(): Promise<void>;
	logout(reason?: string): Promise<void>;
	isExpired(): Promise<boolean>;
	needsRefresh(thresholdMs?: number): Promise<boolean>;
	refreshIfNeeded(refresh: () => Promise<AuthTokens>, thresholdMs?: number): Promise<AuthSessionState>;
	regenerateSession(newTokens: AuthTokens): Promise<AuthSessionState>;
	onEvent(listener: AuthSessionEventListener): () => void;
	dispose(): void;
}

export interface AuthSessionMiddlewareOptions {
	readonly session: AuthSessionManager;
	readonly refresh: () => Promise<AuthTokens>;
	readonly refreshThresholdMs?: number;
	readonly requireAccessToken?: boolean;
	readonly onRefreshed?: (state: AuthSessionState) => void | Promise<void>;
	readonly onRefreshError?: (error: Error) => void | Promise<void>;
}

// ────────────────────────────────────────────────────────────────────────────
// CSRF
// ────────────────────────────────────────────────────────────────────────────

export interface AuthCsrfOptions {
	readonly expectedToken: () => Promise<string | null> | string | null;
	readonly headerName?: string;
	readonly queryParamName?: string;
	readonly safeMethods?: readonly RequestConfig["method"][];
	readonly tokenFactory?: () => Promise<string> | string;
}

export interface AuthCsrfProtection {
	issueToken(): Promise<string>;
	verify(req: Readonly<RequestConfig>): Promise<boolean>;
	middleware(): Middleware;
}

// ────────────────────────────────────────────────────────────────────────────
// Revocation
// ────────────────────────────────────────────────────────────────────────────

export interface AuthRevocationClaims {
	readonly jti?: string;
	readonly sid?: string;
	readonly sub?: string;
	readonly exp?: number;
}

/** Pluggable backend for revocation storage (SEC-H3). */
export interface AuthRevocationRegistryBackend {
	set(bucket: string, key: string, expiresAt: number | null): void | Promise<void>;
	has(bucket: string, key: string): boolean | Promise<boolean>;
	delete(bucket: string, key: string): void | Promise<void>;
	clear(bucket: string): void | Promise<void>;
	keys(bucket: string): readonly string[] | Promise<readonly string[]>;
}

export interface AuthRevocationRegistry {
	revokeToken(tokenId: string, expiresAt?: number): void;
	revokeSession(sessionId: string, expiresAt?: number): void;
	revokeSubject(subject: string, expiresAt?: number): void;
	isRevoked(claims: Readonly<AuthRevocationClaims>): boolean;
	clearExpired(now?: number): void;
	clear(): void;
	snapshot(): Readonly<{
		tokens: readonly string[];
		sessions: readonly string[];
		subjects: readonly string[];
	}>;
}

export interface AuthRevocationGuardOptions {
	readonly registry: AuthRevocationRegistry;
	readonly getClaims: (req: Readonly<RequestConfig>) => Promise<AuthRevocationClaims | null> | AuthRevocationClaims | null;
	readonly onRevoked?: (claims: Readonly<AuthRevocationClaims>) => void | Promise<void>;
}

// ────────────────────────────────────────────────────────────────────────────
// Bridge / SSR
// ────────────────────────────────────────────────────────────────────────────

export interface AuthBridgeCookieOptions {
	readonly accessTokenCookieName?: string;
	readonly refreshTokenCookieName?: string;
	readonly authorizationHeaderName?: string;
	readonly cookiePath?: string;
	readonly sameSite?: "lax" | "strict" | "none";
	readonly secure?: boolean;
	readonly httpOnly?: boolean;
	readonly domain?: string;
	readonly maxAgeSeconds?: number;
}

export interface AuthBridgeRequestLike {
	readonly headers?: Headers | Readonly<Record<string, string | null | undefined>>;
}

export interface AuthBridge {
	readSession(request: AuthBridgeRequestLike): AuthSessionState;
	buildSetCookieHeaders(session: AuthSessionState): readonly string[];
	hydrateSessionManager(session: AuthSessionManager, request: AuthBridgeRequestLike): Promise<AuthSessionState>;
}

// ────────────────────────────────────────────────────────────────────────────
// Presets / Adapters / Framework
// ────────────────────────────────────────────────────────────────────────────

export interface AuthPresetOptions {
	readonly storage?: AuthStore;
	readonly session?: AuthSessionManagerOptions;
	readonly bridge?: AuthBridgeCookieOptions;
}

export interface AuthPreset {
	readonly storage: AuthStore;
	readonly session: AuthSessionManager;
	readonly bridge: AuthBridge;
}

export interface AuthRequestAdapterOptions extends AuthPresetOptions {
	readonly request?: AuthBridgeRequestLike;
}

export interface AuthRequestAdapter {
	readonly preset: AuthPreset;
	readonly storage: AuthStore;
	readonly session: AuthSessionManager;
	readonly bridge: AuthBridge;
	readSession(request?: AuthBridgeRequestLike): AuthSessionState;
	bootstrap(request?: AuthBridgeRequestLike): Promise<AuthSessionState>;
	buildSetCookieHeaders(session: AuthSessionState): readonly string[];
	buildResponseHeaders(session: AuthSessionState, headers?: HeadersInit): Headers;
	buildResponseInit(session: AuthSessionState, init?: ResponseInit): ResponseInit;
}

export interface AuthFrameworkContextOptions extends AuthRequestAdapterOptions {
	readonly onBootstrapError?: (error: unknown) => void;
}

export interface AuthSessionTransferPayload {
	readonly format: "pureq-auth-session-transfer/v1";
	readonly issuedAt: number;
	readonly state: AuthSessionState;
	readonly setCookieHeaders: readonly string[];
}

export interface AuthFrameworkContext {
	readonly adapter: AuthRequestAdapter;
	getState(): AuthSessionState;
	refreshState(): Promise<AuthSessionState>;
	setTokens(tokens: AuthTokens): Promise<AuthSessionState>;
	clearSession(): Promise<AuthSessionState>;
	toResponseHeaders(headers?: HeadersInit): Headers;
	toResponseInit(init?: ResponseInit): ResponseInit;
	toSessionTransferPayload(): AuthSessionTransferPayload;
	dispose(): void;
}

export interface AuthMappedHttpError {
	readonly status: number;
	readonly code?: string;
	readonly message: string;
}

export interface AuthRouteHandlerRecipeOptions {
	readonly sanitizeErrors?: boolean;
}

export interface AuthRouteHandlerRecipe {
	readonly context: AuthFrameworkContext;
	ok(body?: BodyInit | null, init?: ResponseInit): Response;
	json(value: unknown, init?: ResponseInit): Response;
	error(error: unknown, init?: ResponseInit): Response;
}

export interface AuthServerActionSuccess<T> {
	readonly ok: true;
	readonly data: T;
	readonly transferPayload: AuthSessionTransferPayload;
	readonly responseInit: ResponseInit;
}

export interface AuthServerActionFailure {
	readonly ok: false;
	readonly error: AuthMappedHttpError;
	readonly transferPayload: AuthSessionTransferPayload;
	readonly responseInit: ResponseInit;
}

export type AuthServerActionResult<T> = AuthServerActionSuccess<T> | AuthServerActionFailure;

export interface AuthServerActionRecipe {
	readonly context: AuthFrameworkContext;
	run<T>(action: () => Promise<T> | T): Promise<AuthServerActionResult<T>>;
}

// ────────────────────────────────────────────────────────────────────────────
// Hooks (React / Vue)
// ────────────────────────────────────────────────────────────────────────────

export type AuthSessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthSessionHookResult {
	readonly data: AuthSessionState;
	readonly status: AuthSessionStatus;
	readonly update: () => Promise<AuthSessionState>;
}

export interface AuthSessionStore {
	getSnapshot(): AuthSessionState;
	getStatus(): AuthSessionStatus;
	subscribe(listener: () => void): () => void;
	refresh(): Promise<AuthSessionState>;
	update(): Promise<AuthSessionState>;
	dispose(): void;
}

export interface AuthSessionStoreOptions {
	readonly initialState?: AuthSessionState;
	readonly transferPayload?: AuthSessionTransferPayload;
}

export interface ReactUseSyncExternalStore {
	<T>(
		subscribe: (listener: () => void) => () => void,
		getSnapshot: () => T,
		getServerSnapshot?: () => T
	): T;
}

export interface ReactAuthHooks {
	useAuthSession(): AuthSessionHookResult;
	refreshAuthSession(): Promise<AuthSessionState>;
	disposeAuthSessionStore(): void;
}

export interface VueRefLike<T> {
	value: T;
}

export interface VueRuntimeBindings {
	ref<T>(value: T): VueRefLike<T>;
	readonly?<T>(value: VueRefLike<T>): VueRefLike<T>;
	onMounted?(effect: () => void): void;
	onBeforeUnmount?(effect: () => void): void;
}

export interface VueAuthSessionComposable {
	readonly session: VueRefLike<AuthSessionState>;
	refreshAuthSession(): Promise<AuthSessionState>;
	disposeAuthSessionStore(): void;
}

// ────────────────────────────────────────────────────────────────────────────
// Templates / Multi-tenant
// ────────────────────────────────────────────────────────────────────────────

export interface MultiTenantAuthPresetFactoryOptions {
	readonly resolveTenantOptions: (
		tenantId: string
	) => AuthPresetOptions | Promise<AuthPresetOptions>;
	readonly cache?: boolean;
	readonly maxCacheSize?: number;
}

export interface MultiTenantAuthPresetFactory {
	getTenantPreset(tenantId: string): Promise<AuthPreset>;
	clearTenant(tenantId: string): void;
	clearAll(): void;
	dispose(): void;
}

export interface AuthTemplateThreatModel {
	readonly summary: string;
	readonly assumptions: readonly string[];
	readonly mitigations: readonly string[];
	readonly caveats: readonly string[];
}

export interface SingleTenantAuthTemplateOptions extends AuthPresetOptions {
	readonly cookiePrefix?: string;
	readonly secureCookies?: boolean;
	readonly sameSite?: "lax" | "strict" | "none";
}

export interface SingleTenantAuthTemplate {
	readonly kind: "single-tenant";
	readonly preset: AuthPreset;
	readonly threatModel: AuthTemplateThreatModel;
}

export interface MultiTenantTemplateTenantOptions extends AuthPresetOptions {
	readonly cookiePrefix?: string;
}

export interface MultiTenantAuthTemplatePackOptions {
	readonly resolveTenantOptions: (
		tenantId: string
	) => MultiTenantTemplateTenantOptions | Promise<MultiTenantTemplateTenantOptions>;
	readonly cache?: boolean;
	readonly maxCacheSize?: number;
}

export interface MultiTenantAuthTemplatePack {
	readonly kind: "multi-tenant";
	readonly factory: MultiTenantAuthPresetFactory;
	readonly threatModel: AuthTemplateThreatModel;
}

// ────────────────────────────────────────────────────────────────────────────
// Migration
// ────────────────────────────────────────────────────────────────────────────

export interface AuthLegacyTokenSnapshot {
	readonly accessToken?: string | null;
	readonly access_token?: string | null;
	readonly token?: string | null;
	readonly refreshToken?: string | null;
	readonly refresh_token?: string | null;
	readonly refresh?: string | null;
	readonly tokens?: AuthLegacyTokenSnapshot | null;
}

export interface AuthMigrationResult {
	readonly tokens: AuthTokens | null;
	readonly source: "legacy-object" | "legacy-string" | "legacy-nested" | "empty";
}

// ────────────────────────────────────────────────────────────────────────────
// Encryption (FEAT-H7)
// ────────────────────────────────────────────────────────────────────────────

/** AES-GCM based encryption for session tokens and at-rest token storage. */
export interface AuthEncryption {
	encrypt(payload: unknown): Promise<string>;
	decrypt<T = unknown>(token: string): Promise<T>;
}

export interface AuthEncryptionOptions {
	readonly pbkdf2Iterations?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Authorization / RBAC (FEAT-M1)
// ────────────────────────────────────────────────────────────────────────────

export interface AuthAuthorization<TRole extends string = string> {
	hasRole(session: AuthSessionState, role: TRole): boolean;
	hasAnyRole(session: AuthSessionState, roles: readonly TRole[]): boolean;
	requireRole(role: TRole): Middleware;
}

export interface AuthAuthorizationOptions<TRole extends string = string> {
	readonly extractRoles: (session: AuthSessionState) => readonly TRole[];
}

// ────────────────────────────────────────────────────────────────────────────
// Route handlers (FEAT-H4)
// ────────────────────────────────────────────────────────────────────────────

export interface AuthRouteHandlers {
	handleSignIn(request: AuthBridgeRequestLike & { readonly method?: string; readonly url?: string; readonly body?: unknown }): Promise<Response>;
	handleCallback(request: AuthBridgeRequestLike & { readonly url?: string }): Promise<Response>;
	handleSignOut(request: AuthBridgeRequestLike): Promise<Response>;
	handleSession(request: AuthBridgeRequestLike): Promise<Response>;
}

// ────────────────────────────────────────────────────────────────────────────
// Debug (FEAT-L1)
// ────────────────────────────────────────────────────────────────────────────

export interface AuthDebugLogger {
	readonly enabled: boolean;
	log(category: string, message: string, data?: unknown): void;
}

// ────────────────────────────────────────────────────────────────────────────
// Unified config (DX-H2)
// ────────────────────────────────────────────────────────────────────────────

export interface AuthConfig {
	readonly providers?: readonly AuthProvider[];
	readonly adapter?: AuthDatabaseAdapter;
	readonly callbacks?: AuthCallbacks;
	readonly secret?: string;
	readonly session?: AuthSessionManagerOptions;
	readonly storage?: AuthStore;
	readonly bridge?: AuthBridgeCookieOptions;
	readonly debug?: boolean;
	readonly allowDangerousAccountLinking?: boolean;
}

export interface AuthInstance {
	readonly storage: AuthStore;
	readonly session: AuthSessionManager;
	readonly bridge: AuthBridge;
	readonly handlers: AuthRouteHandlers;
	readonly debug: AuthDebugLogger;
}

export interface AuthKitConfig extends AuthConfig {
	readonly sessionStore?: AuthSessionStoreOptions;
	readonly security?: AuthKitSecurityOptions;
}

export type AuthKitRuntimeMode = "browser-spa" | "ssr-bff" | "edge";

export interface AuthKitPolicyOverrideEvent {
	readonly key:
		| "bridge.secure"
		| "bridge.httpOnly"
		| "bridge.sameSite"
		| "session.rotationPolicy"
		| "session.minRefreshIntervalMs";
	readonly mode: AuthKitRuntimeMode;
	readonly recommended: string | number | boolean;
	readonly actual: string | number | boolean;
}

export interface AuthKitSecurityOptions {
	readonly mode?: AuthKitRuntimeMode;
	readonly onPolicyOverride?: (event: AuthKitPolicyOverrideEvent) => void | Promise<void>;
}

export interface AuthKit {
	readonly auth: AuthInstance;
	readonly handlers: AuthRouteHandlers;
	createSessionStore(options?: AuthSessionStoreOptions): AuthSessionStore;
	createReactHooks(useSyncExternalStore: ReactUseSyncExternalStore, options?: AuthSessionStoreOptions): ReactAuthHooks;
	createVueSessionComposable(runtime: VueRuntimeBindings, options?: AuthSessionStoreOptions): () => VueAuthSessionComposable;
}

export type AuthMiddleware = Middleware;
