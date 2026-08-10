import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * The workspace layout: everything under it is scoped to one provider.
 *
 * The slug is in the path rather than only in local storage, which is what
 * makes a provider page a link. Two workspaces open in two tabs used to fight
 * over one storage key and silently show each other's data; a URL cannot do
 * that. It also means a bookmark, a shared link and the back button all point
 * at a workspace rather than at "whichever one was last picked on this device".
 *
 * Nothing is resolved here — `useActiveProvider` reads the param directly. A
 * loader would have to fetch the provider list a second time to translate slug
 * to id, and that list is already in the query cache by the time this renders.
 */
export const Route = createFileRoute("/provider/$slug")({
  component: Outlet,
});
