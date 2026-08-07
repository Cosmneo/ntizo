import type { ProviderSummary } from "@/features/provider/domain/types";
import { providerQueries } from "@/features/provider/data/provider.repository";
import { fetchCurrentUser } from "@/shared/lib/api/me";
import { resolvePostLoginDestination } from "@/shared/lib/zones";

/**
 * Resolves the post-login destination for the current session.
 *
 * Provider ownership can't be read off /me — becoming a provider sets
 * verificationStatus, not role, and CurrentUserDTO doesn't carry it — so the
 * provider list is what decides whether /provider is the right landing spot.
 * A failing provider lookup degrades to "no providers" rather than blocking
 * login.
 */
export async function resolveDestinationForSession(
  next: string | null,
): Promise<string> {
  // Called outside a React context, so this invokes the repository's queryFn
  // directly rather than a hook. See routes/provider/index.tsx for the same
  // pattern and why the cast is needed.
  const listMine = providerQueries.mine().queryFn as () => Promise<
    ProviderSummary[]
  >;
  const [me, providerCount] = await Promise.all([
    fetchCurrentUser(),
    listMine()
      .then((list) => list.length)
      .catch(() => 0),
  ]);
  return resolvePostLoginDestination(me, next, providerCount);
}
