import { useNavigate } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { useClearSessionQueryCache } from "./use-current-user";

/**
 * The dependency-injected core of sign-out — directly testable with no
 * React and no real network call. Unconditionally clears the local session
 * cache and navigates to `/sign-in` in a `finally`: local sign-out state
 * must never depend on the server-side revoke's network round-trip
 * succeeding.
 *
 * better-auth's client sits on `@better-fetch/fetch` with no
 * `throw`/`catchAllError` configured, so an HTTP-level failure resolves as
 * `{ data: null, error }` — that path was already fine, the clear and
 * redirect ran regardless. The gap was a NETWORK-level failure (offline,
 * DNS failure, connection reset), which rejects the underlying `fetch()`
 * directly and propagates out of `authClient.signOut()`'s `await`. Both
 * `SidebarUserMenu`s previously had a bare
 * `await authClient.signOut(); clearSessionQueryCache(); nav(...)` — a
 * rejection there skipped the cache clear and the redirect entirely. The
 * user clicks "Sign out", nothing visibly happens (no navigation, no
 * error — just an unhandled rejection in the console), and the sidebar
 * keeps rendering their name, email, and zone links. They reasonably
 * believe they signed out; on a shared machine that is the wrong thing to
 * be wrong about.
 *
 * Returns whether the server-side revoke itself failed, rather than
 * throwing or silently swallowing it, so the caller can decide whether to
 * tell the user — see `useSignOut()` below.
 */
export async function signOutAndReset(deps: {
  revokeServerSession: () => Promise<unknown>;
  clearSessionQueryCache: () => void;
  navigateToSignIn: () => void;
}): Promise<{ serverRevokeFailed: boolean }> {
  let serverRevokeFailed = false;
  try {
    await deps.revokeServerSession();
  } catch {
    serverRevokeFailed = true;
  } finally {
    deps.clearSessionQueryCache();
    deps.navigateToSignIn();
  }
  return { serverRevokeFailed };
}

/**
 * React hook for both `SidebarUserMenu`s. The local half of sign-out
 * (cache clear + redirect) always runs; callers get `serverRevokeFailed`
 * back to decide whether to surface a toast. Deliberately does not decide
 * that itself or import `sonner` — the i18n/toast call stays in `ui/`,
 * matching how `provider/viewmodel/error-message.ts` returns copy for
 * `ui/` to render rather than rendering it itself.
 */
export function useSignOut() {
  const clearSessionQueryCache = useClearSessionQueryCache();
  const nav = useNavigate();
  return () =>
    signOutAndReset({
      revokeServerSession: () => authClient.signOut(),
      clearSessionQueryCache,
      navigateToSignIn: () => nav({ to: "/sign-in" }),
    });
}
