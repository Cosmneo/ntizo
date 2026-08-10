import { createFileRoute } from "@tanstack/react-router";
import { FavouritesPage } from "@/features/account/ui/placeholder-pages";

export const Route = createFileRoute("/_customer/favourites")({
  component: FavouritesPage,
});
