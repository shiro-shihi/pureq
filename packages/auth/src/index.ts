export type {
	AuthStore,
	AuthBearerOptions,
	AuthRefreshOptions,
	TokenLifecycleOptions,
	AuthBasicOptions,
	AuthCustomOptions,
	BroadcastSyncOptions,
	OIDCFlow,
	OIDCFlowOptions,
	OIDCAuthorizationOptions,
	OIDCAuthorizationResult,
	OIDCTokenEndpointAuthMethod,
	OIDCProviderDefinition,
	OIDCCallbackParams,
	TokenResponse,
	AuthTokens,
	AuthSessionState,
	AuthSessionStatus,
	AuthSessionHookResult,
	AuthSessionManager,
	AuthSessionManagerOptions,
	AuthSessionEvent,
	AuthSessionEventAudit,
	AuthSessionEventExporter,
	AuthSessionEventListener,
	AuthTokenRotationPolicy,
	AuthSessionMiddlewareOptions,
	AuthCsrfOptions,
	AuthCsrfProtection,
	AuthRevocationClaims,
	AuthRevocationRegistry,
	AuthRevocationRegistryBackend,
	AuthRevocationGuardOptions,
	AuthBridge,
	AuthBridgeCookieOptions,
	AuthBridgeRequestLike,
	AuthFrameworkContext,
	AuthFrameworkContextOptions,
	AuthMappedHttpError,
	AuthRouteHandlerRecipe,
	AuthRouteHandlerRecipeOptions,
	AuthRequestAdapter,
	AuthRequestAdapterOptions,
	AuthServerActionFailure,
	AuthServerActionRecipe,
	AuthServerActionResult,
	AuthServerActionSuccess,
	AuthPreset,
	AuthPresetOptions,
	AuthSessionStore,
	AuthSessionStoreOptions,
	ReactAuthHooks,
	ReactUseSyncExternalStore,
	VueAuthSessionComposable,
	VueRuntimeBindings,
	AuthTemplateThreatModel,
	MultiTenantAuthPresetFactory,
	MultiTenantAuthPresetFactoryOptions,
	MultiTenantAuthTemplatePack,
	MultiTenantAuthTemplatePackOptions,
	SingleTenantAuthTemplate,
	SingleTenantAuthTemplateOptions,
	AuthLegacyTokenSnapshot,
	AuthMigrationResult,
	// New types
	AuthUser,
	AuthAccount,
	AuthPersistedSession,
	AuthVerificationToken,
	AuthDatabaseAdapter,
	AuthProvider,
	AuthCredentialsProviderOptions,
	AuthEmailProviderOptions,
	AuthCallbacks,
	AuthEncryption,
	AuthEncryptionOptions,
	AuthAuthorization,
	AuthAuthorizationOptions,
	AuthDebugLogger,
	AuthConfig,
	AuthInstance,
	AuthKit,
	AuthKitConfig,
	AuthRouteHandlers,
} from "./shared/index.js";
export {
	authMemoryStore,
	authLocalStorage,
	authSessionStorage,
	authCookieStore,
	authCustomStore,
	authHybridStore,
	authEncryptedStore,
} from "./storage/index.js";
export { authBearer, authRefresh, authSession, withTokenLifecycle, authBasic, authCustom, withBroadcastSync } from "./middleware/index.js";
export { decodeJwt, verifyJwt } from "./jwt/index.js";
export { createOIDCFlow, createOIDCFlowFromProvider, createOIDCflow, createOIDCflowFromProvider, parseOIDCCallbackParams, oidcProviders } from "./oidc/index.js";
export { createAuthError, buildAuthError } from "./shared/index.js";
export { createAuthCsrfProtection, withCsrfProtection } from "./csrf/index.js";
export { createAuthRevocationRegistry, withRevocationGuard } from "./revocation/index.js";
export { createAuthEventAdapter, composeAuthEventListeners } from "./events/index.js";
export { createAuthBridge } from "./bridge/index.js";
export { createAuthPreset } from "./presets/index.js";
export { createAuthRequestAdapter } from "./adapters/index.js";
export { createAuthFrameworkContext } from "./framework/index.js";
export { createAuthRouteHandlerRecipe, createAuthServerActionRecipe, mapAuthErrorToHttp } from "./framework/recipes.js";
export {
	createExpressAuthKitPack,
	createFastifyAuthKitPack,
	createNextAuthKitPack,
	createReactAuthKitBootstrapPack,
} from "./framework/packs.js";
export { createAuthSessionStore } from "./hooks/index.js";
export { createReactAuthHooks, createVueAuthSessionComposable } from "./hooks/index.js";
export { createMultiTenantAuthPresetFactory } from "./templates/index.js";
export { createSingleTenantAuthTemplate, createMultiTenantAuthTemplatePack } from "./templates/index.js";
export {
	normalizeLegacyAuthTokens,
	migrateLegacyTokensToStore,
	hydrateSessionManagerFromLegacy,
	analyzeAuthMigration,
	formatMigrationParityReport,
	generateMigrationChecklists,
} from "./migration/index.js";
export {
	createAuthSessionManager,
	composeSessionEventAudits,
	createConsoleSessionEventAudit,
	createBufferedSessionEventExporter,
} from "./session/index.js";
export type { SessionEventBufferedExporter, SessionEventExporterOptions } from "./session/index.js";
export type { AuthEventAdapter, AuthEventAdapterOptions } from "./events/index.js";

// New module exports
export {
	createInMemoryAdapter,
	createMySqlAdapter,
	createMySqlExecutor,
	createPostgresAdapter,
	createPostgresExecutor,
	createSqlAdapter,
	getSqlSchemaStatements,
	probeAdapterCapabilities,
	assessAdapterReadiness,
} from "./adapter/index.js";
export type {
	AdapterCapabilityReport,
	AdapterReadinessOptions,
	AdapterReadinessReport,
	MySqlClientLike,
	PostgresClientLike,
	SqlAdapterOptions,
	SqlDialect,
	SqlExecutor,
	SqlRow,
	SqlValue,
	TableNames,
} from "./adapter/index.js";
export {
	credentialsProvider,
	emailProvider,
	createTopProviderPreset,
	listTopProviderPresets,
	validateProviderCallbackContract,
	normalizeProviderError,
	PROVIDER_ERROR_NORMALIZATION_TABLE,
} from "./providers/index.js";
export type {
	TopProviderPreset,
	TopProviderPresetOptions,
	ProviderCallbackContractInput,
	ProviderCallbackContractResult,
	ProviderNormalizedError,
} from "./providers/index.js";
export { composeAuthCallbacks } from "./callbacks/index.js";
export { createAuthEncryption } from "./encryption/index.js";
export { createAuthorization } from "./authorization/index.js";
export { createAuthDebugLogger } from "./debug/index.js";
export { createAuth } from "./core/index.js";
export { createAuthKit } from "./core/kit.js";
export { createAuthStarter } from "./core/starter.js";
export type { AuthStarter, AuthStarterConfig } from "./core/starter.js";
