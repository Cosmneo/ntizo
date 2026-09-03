import { createFileRoute } from "@tanstack/react-router";

/**
 * One booking, on its own page — the destination every row of the list links
 * to.
 *
 * Registered ahead of the page it will render: a `Link` is type-checked
 * against the generated route tree, so a list that links to a route nobody
 * has declared does not compile. The component is the next slice's.
 */
export const Route = createFileRoute("/provider/$slug/bookings/$bookingId")({
  component: () => null,
});
