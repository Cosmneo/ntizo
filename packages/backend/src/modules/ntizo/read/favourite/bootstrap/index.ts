import { DrizzleFavouriteListRepository } from "../../../bounded-contexts/favourite/infrastructure/repositories/drizzle/favourite-list.repository";
import { DrizzleFavouriteRepository } from "../../../bounded-contexts/favourite/infrastructure/repositories/drizzle/favourite.repository";
import { DrizzleServiceReadRepository } from "../../../bounded-contexts/catalog/infrastructure/repositories/drizzle/service-read.repository";
import { DrizzleProviderPublicRepository } from "../../../public/provider/infra/repositories/drizzle/provider-public.repository";
import { ListServicesProjection } from "../../../public/catalog/app/use-cases/list-services.projection";
import { ListPublicProvidersProjection } from "../../../public/provider/app/use-cases/list-public-providers.projection";
import { DelegatedServiceCardReader } from "../infra/readers/service-card-reader.adapter";
import { DelegatedProviderCardReader } from "../infra/readers/provider-card-reader.adapter";
import { ListMyListsProjection } from "../app/use-cases/list-my-lists.projection";
import { ListListEntriesProjection } from "../app/use-cases/list-list-entries.projection";
import { MarkFavouritesProjection } from "../app/use-cases/mark-favourites.projection";
import { ListsForTargetProjection } from "../app/use-cases/lists-for-target.projection";

/**
 * The read tier imports the write tier's two favourite repositories rather
 * than owning duplicates — the same ruling `read/activity`'s bootstrap
 * documents and for the same reason: these read models are the same rows in
 * the same shape as the write side's, and a second class running identical SQL
 * is two places to fix one bug.
 *
 * The two card readers are wired the same way one level out. Each wraps the
 * *projection* that already owns its listing's visibility rule — published and
 * the provider active for a service, listed and active for a business — so a
 * favourite pointing at something that has stopped being visible is resolved
 * away by the same code that stopped showing it on the browse. Wiring the
 * repositories straight into the readers would have put a second copy of that
 * rule here, and the two would drift.
 */
export function bootstrapFavouriteRead() {
  const favouriteListRepository = new DrizzleFavouriteListRepository();
  const favouriteRepository = new DrizzleFavouriteRepository();

  const serviceCards = new DelegatedServiceCardReader(
    new ListServicesProjection(new DrizzleServiceReadRepository()),
  );
  const providerCards = new DelegatedProviderCardReader(
    new ListPublicProvidersProjection(new DrizzleProviderPublicRepository()),
  );

  return {
    adapters: { favouriteListRepository, favouriteRepository, serviceCards, providerCards },
    useCases: {
      listMine: new ListMyListsProjection(
        favouriteListRepository,
        favouriteRepository,
        serviceCards,
        providerCards,
      ),
      listById: new ListListEntriesProjection(
        favouriteListRepository,
        favouriteRepository,
        serviceCards,
        providerCards,
      ),
      marked: new MarkFavouritesProjection(favouriteRepository),
      listsForTarget: new ListsForTargetProjection(favouriteRepository),
    },
  };
}

export type FavouriteReadBootstrap = ReturnType<typeof bootstrapFavouriteRead>;
