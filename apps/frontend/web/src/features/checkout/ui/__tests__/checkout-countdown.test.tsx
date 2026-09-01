import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function renderCountdown(expiresAt: string) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <CheckoutCountdown expiresAt={expiresAt} serviceId="svc-1" />,
  });
  // Step 1, the destination a lapsed hold sends the customer back to.
  const bookRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/book/$serviceId",
    validateSearch: (search: Record<string, unknown>) => search as { expired?: boolean },
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

  it("treats an expiry that has already passed as expired, not as a negative clock", async () => {
    const { router } = renderCountdown(expiresIn(-60));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(router.state.location.pathname).toBe("/book/svc-1");
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });
});
