import { DrizzleFavouriteListRepository } from "../infrastructure/repositories/drizzle/favourite-list.repository";
import { DrizzleFavouriteRepository } from "../infrastructure/repositories/drizzle/favourite.repository";
import { QuickSaveCommand } from "../app/use-cases/quick-save.command";
import { SetListsCommand } from "../app/use-cases/set-lists.command";
import { CreateListCommand } from "../app/use-cases/create-list.command";
import { RenameListCommand } from "../app/use-cases/rename-list.command";
import { RemoveListCommand } from "../app/use-cases/remove-list.command";

export function bootstrapFavourite() {
  const favouriteListRepository = new DrizzleFavouriteListRepository();
  const favouriteRepository = new DrizzleFavouriteRepository();
  return {
    repositories: { favouriteList: favouriteListRepository, favourite: favouriteRepository },
    useCases: {
      quickSave: new QuickSaveCommand(favouriteListRepository, favouriteRepository),
      setLists: new SetListsCommand(favouriteListRepository, favouriteRepository),
      createList: new CreateListCommand(favouriteListRepository),
      renameList: new RenameListCommand(favouriteListRepository),
      removeList: new RemoveListCommand(favouriteListRepository),
    },
  };
}

export type FavouriteBootstrap = ReturnType<typeof bootstrapFavourite>;
