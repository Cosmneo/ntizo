import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { ConfirmPage } from "@/features/checkout/ui/confirm-page";

/**
 * Step 3 of checkout, at `/booking/<bookingId>/confirm`: read it back, say
 * which handset the payment prompt goes to, send it.
 *
 * The id in this position is a *booking*, as it is on step 2 — the draft
 * exists, it holds the slot, and it knows which service and which package it
 * was made from. Step 1 is the one page of the three addressed by a service.
 *
 * `ssr: false`, for step 1's reasons and one more: this page is behind a
 * session, so there is nothing a crawler could render and nothing a
 * prerenderer should be handed.
 *
 * Outside `_customer` deliberately, exactly as step 2 is. That layout has the
 * guard this page wants, but it also has the account chrome — a sidebar of
 * settings pages around a purchase in progress. Checkout keeps the plain site
 * header its first step uses, so the guard is repeated here rather than the
 * shell inherited.
 */
export const Route = createFileRoute("/booking/$bookingId/confirm")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    // `next` carries the whole href, search parameters included, so signing
    // in and coming back lands on this booking rather than on the home page.
    if (!session) throw redirect({ to: "/sign-in", search: { next: location.href } });
  },
  /**
   * **No search parameters, for step 2's reason.** Everything this page needs
   * beyond the id is either on the booking (`serviceId`, `serviceOptionId`,
   * the price, the slot and its zone) or in the tab's own store (the address
   * the customer chose and the note they wrote). A copy in the URL would be a
   * second source for a fact the booking already owns, and the one a shared
   * or bookmarked link can get wrong.
   */
  component: Confirm,
});

function Confirm() {
  const { bookingId } = Route.useParams();
  // Keyed by the booking, so the phone the customer typed and the details
  // restored from the store start over when the id does. The router reuses
  // one match across a param change, and this page's state is restored from a
  // store keyed by that same id — without the key, one booking's details
  // would reconcile onto another's.
  return <ConfirmPage key={bookingId} bookingId={bookingId} />;
}
