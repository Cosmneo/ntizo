type MaybeSession = { user?: unknown } | null | undefined;

/**
 * `/accept-invite/$token` fires `providerInvitesAccept` on mount (see
 * `features/auth/components/accept-invite.tsx`), which requires an
 * authenticated session — the invitee must already be signed in to be added
 * as a member. An anonymous visitor arriving straight from the emailed
 * invite link needs to sign in first; without this guard the mutation fires
 * unauthenticated, fails with a masked error, and `hasFiredRef` blocks any
 * retry — a dead end. Redirect to sign-in with `next` so the invitee lands
 * back here once authenticated.
 *
 * Modeled on `routes/provider/provider-guard.ts`'s `resolveProviderGuard`.
 */
export function resolveAcceptInviteGuard(session: MaybeSession, path: string):
  | { redirectTo: "/sign-in"; search: { next: string } }
  | null {
  if (session && session.user) return null;
  return { redirectTo: "/sign-in", search: { next: path } };
}
