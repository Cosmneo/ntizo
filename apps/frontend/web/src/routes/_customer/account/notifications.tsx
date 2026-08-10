import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Notifications moved into Preferences as one of its sections.
 *
 * The route stays as a redirect rather than being deleted: it was in the
 * sidebar, so it is in browser histories and bookmarks, and a 404 is a worse
 * answer than the page the user was actually looking for.
 */
export const Route = createFileRoute("/_customer/account/notifications")({
  beforeLoad: () => {
    throw redirect({ to: "/account/preferences", replace: true });
  },
});
