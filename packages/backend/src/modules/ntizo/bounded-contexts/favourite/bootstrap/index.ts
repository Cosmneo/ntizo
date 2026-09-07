import { DrizzleFavouriteListRepository } from "../infrastructure/repositories/drizzle/favourite-list.repository";
import { DrizzleFavouriteRepository } from "../infrastructure/repositories/drizzle/favourite.repository";
import { QuickSaveCommand } from "../app/use-cases/quick-save.command";

export function bootstrapFavourite() {
  const favouriteListRepository = new DrizzleFavouriteListRepository();
  const favouriteRepository = new DrizzleFavouriteRepository();
  return {
    repositories: { favouriteList: favouriteListRepository, favourite: favouriteRepository },
    useCases: {
      quickSave: new QuickSaveCommand(favouriteListRepository, favouriteRepository),
    },
  };
}

export type FavouriteBootstrap = ReturnType<typeof bootstrapFavourite>;
