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
 * Lives in the provider feature's viewmodel (not shared/) because it depends
 * on the provider data layer — `shared` may not import `data` directly.
 */
export async function resolveDestinationForSession(
  next: string | null,
): Promise<string> {
  const [me, providerCount] = await Promise.all([
    fetchCurrentUser(),
    countMyProviders(),
  ]);
  return resolvePostLoginDestination(me, next, providerCount);
}
