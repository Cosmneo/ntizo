import { listMyProviders } from "@/features/provider/lib/provider-api";
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
  const [me, providerCount] = await Promise.all([
    fetchCurrentUser(),
    listMyProviders()
      .then((list) => list.length)
      .catch(() => 0),
  ]);
  return resolvePostLoginDestination(me, next, providerCount);
}
