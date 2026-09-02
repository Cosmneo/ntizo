import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { DetailsPage } from "@/features/checkout/ui/details-page";

/**
 * Step 2 of checkout, at `/booking/<bookingId>/details`: where, and what.
 *
 * The id in this position is a *booking*, and from here on it is the only
 * thing the URL is about — the draft exists by now, it holds the slot, and it
 * knows which service and which package it was made from. Step 1 is the one
 * page of the three addressed by a service.
 *
 * `ssr: false`, for step 1's reasons and one more: this page is behind a
 * session, so there is nothing a crawler could render and nothing a
 * prerenderer should be handed.
 *
 * Outside `_customer` deliberately. That layout has the guard this page
 * wants, but it also has the account chrome — a sidebar of settings pages
 * around a purchase in progress. Checkout wears its own header
 * (the steps and a lock, no navigation), so the guard is repeated here
 * rather than the shell inherited.
 */
export const Route = createFileRoute("/booking/$bookingId/details")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    // `next` carries the whole href, search parameters included, so signing
    // in and coming back lands on this booking rather than on the home page.
    if (!session) throw redirect({ to: "/sign-in", search: { next: location.href } });
  },
  /**
   * **No search parameters, and that is a decision rather than an omission.**
   *
   * This page needs to know which service and which package the draft was
   * made from — it is where the countdown sends the customer when the hold
   * lapses. Both used to travel here in the URL, because `bookingReadModel`
   * carried neither. They are now fields on the booking itself
   * (`serviceId`, `serviceOptionId`), which is the only honest source: a
   * shared or bookmarked link carrying its own copy could name a service that
   * disagreed with the booking, and nothing on either side would notice.
   *
   * The path parameter is the whole address, which is what the design says
   * about this route — "steps 2 and 3 have nothing else".
   */
  component: Details,
});

function Details() {
  const { bookingId } = Route.useParams();
  // Keyed by the booking, so the address the customer picked and the note
  // they wrote start over when the id does. The router reuses one match
  // across a param change, and this page's state is restored from a store
  // keyed by that same id — without the key, one booking's details would
  // reconcile onto another's.
  return <DetailsPage key={bookingId} bookingId={bookingId} />;
}
