import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/provider` used to send a provider-less customer here, a two-button
 * scaffold. It now sends them to /onboarding, the five-phase wizard (see
 * `routes/provider/index.tsx`'s beforeLoad) — this page was the target,
 * never a step in getting there.
 *
 * The route stays as a redirect rather than being deleted: it was linked
 * once (from `/provider` itself), so it is in browser histories and
 * bookmarks, and a 404 is a worse answer than the page the user was
 * actually looking for — the same call already made for
 * `routes/_customer/account/notifications.tsx` when that page moved.
 */
export const Route = createFileRoute("/provider/no-provider")({
  beforeLoad: () => {
    throw redirect({ to: "/onboarding" });
  },
});
