import { fetchCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { resolvePostLoginDestination } from "@/shared/lib/zones";
import { countMyProviders } from "./use-providers";

/**
 * Resolves the post-login destination for the current session.
 *
 * Provider ownership can't be read off /me — becoming a provider sets
 * verificationStatus, not role, and CurrentUserDTO doesn't carry it — so the
 * provider list is what decides whether /provider is the right landing spot.
 * A failing provider lookup degrades to "no providers" rather than blocking
 * login.
 *
 * `fetchCurrentUser()` now rejects on a genuine backend failure instead of
 * degrading to `null` on its own (see its doc comment) — a deliberate
 * change made so route guards like `routes/admin/route.tsx` can fail loudly
 * instead of silently misrouting. This call site makes the opposite choice
 * on purpose: `resolveDestinationForSession` runs right after (or in place
 * of) a just-completed sign-in — both `sign-in.tsx`'s submit handler and
 * `routes/_public/route.tsx`'s beforeLoad call it — and blocking that
 * redirect on a transient read failure (leaving an already-authenticated
 * user stuck on a "Something went wrong" form error, or an unhandled route
 * error) is worse than landing them on "/" and letting the next successful
 * `/me` fetch fill in their real zone. So the failure is caught here,
 * explicitly, rather than by reintroducing a blanket catch inside
 * `fetchCurrentUser()` itself.
 *
 * Lives in the provider feature's viewmodel (not shared/) because it depends
 * on the provider data layer — `shared` may not import `data` directly.
 */
export async function resolveDestinationForSession(
  next: string | null,
): Promise<string> {
  const [me, providerCount] = await Promise.all([
    fetchCurrentUser().catch(() => null),
    countMyProviders(),
  ]);
  return resolvePostLoginDestination(me, next, providerCount);
}
