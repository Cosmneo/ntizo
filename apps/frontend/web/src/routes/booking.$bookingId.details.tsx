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
 * around a purchase in progress. Checkout keeps the plain site header its
 * first step uses, so the guard is repeated here rather than the shell
 * inherited.
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
   * **`serviceId` is a search parameter because `bookingReadModel` has no
   * service id in it.** The booking carries the service's *name* — it is a
   * snapshot of what was agreed rather than a join — and this page has one
   * job it must be able to do when the booking cannot be read at all: send
   * the customer back to step 1 with the service kept, which is what the
   * design's failure table asks for when a hold lapses. There is no other
   * source for that id, so it travels the way step 1's slot does: in the URL,
   * where a refresh and a shared link both keep it.
   *
   * `optionId` rides along for the reason it was put on step 1's route. A
   * customer sent back without it re-books the service's cheapest option
   * rather than the package whose price they read — the same silent downgrade
   * that id exists to prevent, arriving one page later.
   *
   * Every key is returned, and a rejected one is returned as `undefined`
   * rather than omitted — see `book.$serviceId.tsx`, which spells out why:
   * a match's search is `{ ...parentSearch, ...validated }` and the root
   * validates nothing, so a key this function does not name keeps whatever
   * raw value the URL had.
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): { serviceId?: string; optionId?: string } => {
    const text = (key: string): string | undefined => {
      const raw = search[key];
      return typeof raw === "string" && raw !== "" ? raw : undefined;
    };
    return { serviceId: text("serviceId"), optionId: text("optionId") };
  },
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
