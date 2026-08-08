import { createStart } from "@tanstack/react-start";

/**
 * TanStack Start instance.
 *
 * Cache policy — the only thing this file decides:
 *   `/`                     public, edge-cacheable with stale-while-revalidate
 *   everything else         private, no-store
 *
 * Every non-`/` route is session-dependent and client-rendered (`ssr: false`),
 * so its HTML shell must never be shared between users. `no-store` is the safe
 * default and anything public must opt in explicitly.
 */
export const startInstance = createStart(() => ({
  // SSR is OFF by default. Only routes that explicitly set `ssr: true` are
  // server-rendered — today just `/`. Fail-safe: a new authenticated route that
  // forgets the flag stays client-rendered instead of silently emitting a
  // session-shaped, cacheable HTML shell.
  defaultSsr: false,
  requestMiddleware: [],
}));
