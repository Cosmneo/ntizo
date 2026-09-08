import { createFileRoute } from "@tanstack/react-router";
import { FavouritesPage } from "@/features/favourites/ui/favourites-page";

export const Route = createFileRoute("/_customer/favourites")({
  component: FavouritesPage,
});
