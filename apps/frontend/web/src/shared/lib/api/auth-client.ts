// Re-exported from the @ntizo/auth-client workspace package so the ~20
// existing `@/shared/lib/api/auth-client` importers keep working unchanged.
// See packages/auth-client/src/index.ts for the client construction.
export {
  authClient,
  useSession,
  signOut,
  API_BASE_URL,
  // Absolute origin, needed by anything that fetches during SSR — a relative
  // URL has nothing to resolve against on the server.
  AUTH_API_URL_FALLBACK,
} from "@ntizo/auth-client";
