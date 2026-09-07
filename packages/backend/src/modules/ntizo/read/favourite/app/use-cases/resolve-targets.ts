import type { ProviderPublicDTO, ServiceDTO } from "@ntizo/shared/read-models";
import type { FavouriteTarget } from "../../../../bounded-contexts/favourite/domain/favourite-target";
import type { ServiceCardReaderPort } from "../ports/outbound/service-card-reader.port";
import type { ProviderCardReaderPort } from "../ports/outbound/provider-card-reader.port";

/** What a favourite row points at, with nothing of the row itself attached. */
export interface FavouriteTargetRef {
  targetType: FavouriteTarget;
  targetId: string;
}

/** Everything on a page that still resolves, by id, one map per kind. */
export interface ResolvedTargets {
  services: Map<string, ServiceDTO>;
  providers: Map<string, ProviderPublicDTO>;
}

export interface TargetReaders {
  services: ServiceCardReaderPort;
  providers: ProviderCardReaderPort;
}

function idsOfKind(refs: readonly FavouriteTargetRef[], kind: FavouriteTarget): string[] {
  return [...new Set(refs.filter((r) => r.targetType === kind).map((r) => r.targetId))];
}

/**
 * Resolves a whole page of saved targets — **one call per kind, never one per
 * entry**.
 *
 * Shared by the two projections that need it rather than written twice: a page
 * of entries and a page of lists' cover tiles are the same problem, and two
 * copies of "group by kind, resolve, map back" is two places for the
 * one-query-per-row regression to reappear. A helper, not a projection, which
 * is why it does not live in a `*.projection.ts` file.
 *
 * A kind with no ids is not asked for at all: a page of only services must not
 * also fire a providers query that can only come back empty. The two that do
 * run go concurrently — they are independent, and awaiting them in sequence
 * adds a round trip to every page.
 *
 * Ids are deduplicated before they are sent. A listing saved to a list and
 * also sitting in that list's cover tiles is one id, asked once.
 *
 * The maps are the *survivors*. An id the reader did not return is a listing
 * that is gone, unpublished, or whose provider is suspended — the caller drops
 * that entry. There is no foreign key behind these rows, on purpose, and this
 * is where that is paid for.
 */
export async function resolveTargets(
  refs: readonly FavouriteTargetRef[],
  readers: TargetReaders,
  locale: string,
): Promise<ResolvedTargets> {
  const serviceIds = idsOfKind(refs, "service");
  const providerIds = idsOfKind(refs, "provider");

  const [services, providers] = await Promise.all([
    serviceIds.length > 0 ? readers.services.findByIds({ ids: serviceIds, locale }) : Promise.resolve([]),
    providerIds.length > 0 ? readers.providers.findByIds({ ids: providerIds, locale }) : Promise.resolve([]),
  ]);

  return {
    services: new Map(services.map((s) => [s.id, s])),
    providers: new Map(providers.map((p) => [p.id, p])),
  };
}

/**
 * The one image a cover tile draws for a saved target, or null when there is
 * none to draw.
 *
 * A service offers its own photographs and nothing else: `serviceReadModel`
 * carries no provider logo — only `serviceDetailReadModel` does — so a service
 * with no pictures contributes no tile rather than borrowing one.
 *
 * A business leads with its logo and falls back to the first photograph of its
 * work. That order is the one `providerPublicReadModel.logoUrl` already
 * documents ("a service card with no photo of its own falls back to it"): the
 * logo is the image the business chose to be recognised by.
 *
 * Null, never a placeholder URL: the read model says fewer than four tiles —
 * often zero — is normal and the client draws the gaps. Four broken images is
 * worse than two real ones.
 */
export function coverUrlFor(ref: FavouriteTargetRef, resolved: ResolvedTargets): string | null {
  if (ref.targetType === "service") {
    return resolved.services.get(ref.targetId)?.imageUrls[0] ?? null;
  }
  const provider = resolved.providers.get(ref.targetId);
  if (!provider) return null;
  return provider.logoUrl ?? provider.photoUrls[0] ?? null;
}
