import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import i18n from "@/shared/lib/i18n";
import { CheckoutCountdown } from "../checkout-countdown";

/** The one moment this file is pinned to. */
const NOW = "2026-09-04T12:00:00.000Z";

/** An instant `seconds` from `NOW`, as the draft's `expiresAt` would carry it. */
function expiresIn(seconds: number): string {
  return new Date(Date.parse(NOW) + seconds * 1000).toISOString();
}

function renderCountdown(expiresAt: string, optionId?: string, sending = false) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    // A host owning `sending` as state, so a test can end the flight the way
    // step 3 does — a mutation settling — rather than by re-rendering the
    // whole router with a different closure. "Land" is what makes the
    // deferral assertable as a deferral rather than as a cancellation.
    component: function Host() {
      const [inFlight, setInFlight] = useState(sending);
      return (
        <>
          <CheckoutCountdown
            expiresAt={expiresAt}
            serviceId="svc-1"
            optionId={optionId}
            sending={inFlight}
          />
          <button type="button" onClick={() => setInFlight(false)}>
            land
          </button>
        </>
      );
    },
  });
  // Step 1, the destination a lapsed hold sends the customer back to.
  const bookRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/book/$serviceId",
    validateSearch: (search: Record<string, unknown>) =>
      search as { expired?: boolean; optionId?: string },
    component: () => <p>choose when</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, bookRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  render(<RouterProvider router={router} />);
  return { router };
}

/**
 * Let the router resolve its initial match.
 *
 * `createRouter`'s first match lands a tick after `render()` returns — the
 * same async seam every router-backed suite here works around. The other
 * files reach for `findBy*`; this one cannot, because its timers are fake and
 * the thing being waited on is the very clock under test.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/**
 * The locale is pinned rather than inherited: the assertions read Portuguese,
 * and this suite's default resolves to English. Fake timers, because the
 * whole component is a clock — and `setSystemTime` so the ISO instant in the
 * fixture means something fixed relative to "now".
 */
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  await i18n.changeLanguage("pt-MZ");
});

afterEach(async () => {
  vi.useRealTimers();
  await i18n.changeLanguage("en-US");
});

describe("CheckoutCountdown", () => {
  it("reads the hold left off the draft's own expiry, in minutes and seconds", async () => {
    renderCountdown(expiresIn(30 * 60));
    await settle();
    // Rounded up, so a thirty-minute hold reads 30:00 at the instant it
    // starts rather than 29:59.
    expect(screen.getByRole("timer")).toHaveTextContent("Hora reservada 30:00");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("Hora reservada 28:59");
  });

  it("goes back to step 1 with a message rather than sitting at 00:00", async () => {
    // The slot is released by then. Leaving the customer on a page that still
    // asks for their address, under a timer that has stopped, is a form that
    // cannot be submitted and does not say so.
    const { router } = renderCountdown(expiresIn(30));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(router.state.location.pathname).toBe("/book/svc-1");
    expect(router.state.location.search).toMatchObject({ expired: true });
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("takes the lapsed draft's package back to step 1 with it", async () => {
    // Otherwise a customer who chose the 900 package, spent twenty-nine
    // minutes on step 2 and let the hold lapse restarts on the cheapest one —
    // the same silent downgrade `/book/$serviceId`'s `optionId` exists to
    // prevent, arriving one page later.
    const { router } = renderCountdown(expiresIn(30), "opt-2");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(router.state.location.search).toMatchObject({ expired: true, optionId: "opt-2" });
  });

  it("does not navigate out from under a request that is being sent", async () => {
    // **The send is two sequential round trips on a Mozambican mobile
    // connection**, and the server accepts a submit a second past the
    // deadline — the checkout-hold sweep runs on a one-minute cadence. So
    // pressing "Enviar pedido" in the last seconds ends with the request
    // landing while this component navigates away saying the slot was
    // released. The customer then books a second slot, the one-draft rule
    // does not clean up the first (`findOpenDraftForCustomer` filters
    // `status = 'DRAFT'` and a sent request is not one), and the provider
    // gets two requests for one job.
    const { router } = renderCountdown(expiresIn(5), undefined, true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(router.state.location.pathname).toBe("/");
  });

  it("goes back once the send has settled and the hold really is gone", async () => {
    // The other half: this is a deferral, not a cancellation. A send that
    // *failed* in the last seconds leaves a customer holding nothing, and by
    // the time it has failed "the slot was released" is the true thing to
    // say.
    const { router } = renderCountdown(expiresIn(5), undefined, true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(router.state.location.pathname).toBe("/");

    await act(async () => {
      screen.getByRole("button", { name: "land" }).click();
    });

    expect(router.state.location.pathname).toBe("/book/svc-1");
    expect(router.state.location.search).toMatchObject({ expired: true });
  });

  it("treats an expiry that has already passed as expired, not as a negative clock", async () => {
    const { router } = renderCountdown(expiresIn(-60));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(router.state.location.pathname).toBe("/book/svc-1");
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});
