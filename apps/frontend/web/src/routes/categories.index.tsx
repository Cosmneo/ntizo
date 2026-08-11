import { createFileRoute } from "@tanstack/react-router";
import { CategoriesPage } from "@/features/landing/ui/categories-page";

/**
 * Every category, at /categories.
 *
 * `categories.index.tsx` rather than `categories.tsx`, for the same reason the
 * directory is `providers.index.tsx`: the un-suffixed name makes a file a
 * LAYOUT for any sibling `categories.$x` route, and a layout that renders a
 * list instead of an <Outlet/> silently serves the list at every child URL.
 *
 * `ssr: true` and deliberately not prerendered. Categories are administered at
 * runtime and nothing rebuilds the site when one is added — a page that only
 * updated on deploy would be wrong the moment somebody used the admin form.
 */
export const Route = createFileRoute("/categories/")({
  ssr: true,
  component: CategoriesPage,
});
