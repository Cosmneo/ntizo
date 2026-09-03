import { createFileRoute } from "@tanstack/react-router";
import { AdminSupportPage } from "@/features/admin/support/ui/support-page";

/**
 * The support queue, at /admin/support.
 *
 * Named `support.index.tsx`, not `support.tsx` — the same fix
 * `routes/providers.index.tsx`'s own doc comment records for the identical
 * bug. With a sibling `support.$threadId.tsx`, an un-suffixed `support.tsx`
 * makes this a LAYOUT route for the detail route rather than its sibling
 * under `/admin`, and since it renders the queue table with no `<Outlet/>`,
 * every /admin/support/<threadId> URL silently kept showing the queue.
 * Verified: `routeTree.gen.ts` nested `AdminSupportThreadIdRoute` as a child
 * of `AdminSupportRoute` before this rename, and as a sibling under it
 * after.
 */
export const Route = createFileRoute("/admin/support/")({
  component: AdminSupportPage,
});
