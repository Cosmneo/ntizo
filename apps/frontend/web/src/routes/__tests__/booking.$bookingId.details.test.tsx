import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { AddressDTO } from "@ntizo/shared";
import i18n from "@/shared/lib/i18n";

/**
 * The route itself — `validateSearch`, the session guard and the remount
 * wrapper — driven through the real `Route` rather than a stand-in.
 *
 * **A stand-in cannot fail for the route**, which is the lesson
 * `book.$serviceId.test.tsx` was written to record: every suite that renders
 * step 2 builds its own permissive passthrough `validateSearch`, and nothing
 * in `src/` imports this module except the generated tree. `serviceId` could
 * be dropped from the real narrowing and the page suite would stay green
 * while a customer whose hold lapsed was sent to browse instead of back to
 * the service they were buying.
 *
 * It lives under `src/routes/` because `boundaries/dependencies` forbids `ui`
 * importing `routes`, so this is the only layer that can hold both halves.
 */
const fakes = vi.hoisted(() => ({
  booking: null as unknown,
  addresses: [] as AddressDTO[],
  session: null as { user: { id: string } } | null,
}));

vi.mock("@/features/checkout/data/checkout.repository", () => ({
  bookingQueries: {
    byId: (bookingId: string) => ({
      queryKey: ["booking", bookingId],
      // The id it answers with is the id it was asked for, because that is
      // what the server does: `findForCustomer` filters on the id *inside*
      // the query. A fake that always answered "bk-1" would let a page
      // reading `booking.id` look correct while addressing another booking's
      // stored details.
      queryFn: async () =>
        fakes.booking ? { ...(fakes.booking as object), id: bookingId } : null,
    }),
  },
  createBooking: vi.fn(),
}));

vi.mock("@/features/account/data/address.repository", () => ({
  addressQueries: {
    mine: () => ({ queryKey: ["user", "addresses"], queryFn: async () => fakes.addresses }),
  },
  addAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
}));

vi.mock("@/features/account/data/cities.repository", () => ({
  cityQueries: {
    search: () => ({ queryKey: ["public", "cities"], queryFn: async () => [] }),
  },
}));

vi.mock("@/shared/lib/api/auth-client", () => ({
  API_BASE_URL: "http://localhost",
  authClient: { getSession: async () => ({ data: fakes.session }) },
}));

const { Route: DetailsRoute } = await import("../booking.$bookingId.details");

const NOW = "2026-09-04T12:00:00.000Z";

function bookingFixture(status: string): unknown {
  return {
    id: "bk-1",
    status,
    serviceName: "Corte de cabelo",
    providerName: "Studio X",
    providerSlug: "studio-x",
    optionName: "Corte e barba",
    durationMinutes: 90,
    priceMinor: 90000,
    currency: "MZN",
    startsAt: "2026-09-04T13:00:00.000Z",
    endsAt: "2026-09-04T14:30:00.000Z",
    addressLabel: null,
    addressLine: null,
    addressCity: null,
    addressDistrict: null,
    addressDirections: null,
    description: null,
    expiresAt: "2026-09-04T12:30:00.000Z",
    createdAt: NOW,
  };
}

/**
 * A router carrying the **real** route, parented exactly the way
 * `routeTree.gen.ts` parents it. The cast mirrors the generated file's own:
 * a file route's parent is supplied at generation time, and a test that wants
 * the real route has to supply it the same way.
 */
function renderRoute(
  at: string,
  { signedIn = true, status = "EXPIRED" }: { signedIn?: boolean; status?: string } = {},
) {
  fakes.session = signedIn ? { user: { id: "cust-1" } } : null;
  fakes.addresses = [];
  // Lapsed by default, so the cases about *where this route sends somebody it
  // cannot keep on the page* do not also depend on the form rendering.
  fakes.booking = bookingFixture(status);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute();
  (DetailsRoute as unknown as { update: (options: unknown) => void }).update({
    id: "/booking/$bookingId/details",
    path: "/booking/$bookingId/details",
    getParentRoute: () => rootRoute,
  });

  const stub = (path: string) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      validateSearch: (search: Record<string, unknown>) => search,
      component: () => <p>{path}</p>,
    });

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      DetailsRoute as never,
      stub("/"),
      stub("/sign-in"),
      stub("/services"),
      stub("/bookings"),
      stub("/book/$serviceId"),
      stub("/booking/$bookingId/confirm"),
    ]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [at] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );

  return { router };
}

beforeEach(async () => {
  await i18n.changeLanguage("pt-MZ");
  vi.setSystemTime(new Date(NOW));
  sessionStorage.clear();
});

afterEach(async () => {
  vi.useRealTimers();
  await i18n.changeLanguage("en-US");
});

describe("the /booking/$bookingId/details route", () => {
  it("lets the service through validation and back to step 1 with it", async () => {
    // The one assertion that fails if `serviceId` is dropped from the route's
    // own narrowing. Every other suite passes a permissive `validateSearch`,
    // so this is the only place the real one is load-bearing.
    const { router } = renderRoute("/booking/bk-1/details?serviceId=svc-1&optionId=opt-2");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/book/svc-1");
      expect(router.state.location.search).toMatchObject({
        expired: true,
        optionId: "opt-2",
      });
    });
  });

  it("narrows every key it names rather than letting the URL's own value through", () => {
    // Called directly, and that is the point rather than a shortcut. A
    // match's search is `{ ...parentSearch, ...validated }` and the root
    // validates nothing, so a key this function does not *name* survives from
    // the raw URL with whatever the parser gave it — follow-up #109. Driving
    // the router instead would prove nothing here: an unnarrowed `serviceId`
    // arrives as the same string the narrowing would have returned, and only
    // a rejected value tells the two apart.
    const narrow = DetailsRoute.options.validateSearch as unknown as (
      search: Record<string, unknown>,
    ) => { serviceId?: string; optionId?: string };

    expect(narrow({ serviceId: "svc-1", optionId: "opt-2" })).toEqual({
      serviceId: "svc-1",
      optionId: "opt-2",
    });
    // `""` would send the customer to `/book/`, which matches no route, and a
    // non-string is somebody typing. Both come back named and `undefined`,
    // which is what overrides the raw value — and costs nothing in the
    // address bar, since the router's own `encode` skips `undefined`.
    expect(narrow({ serviceId: "", optionId: 7 })).toEqual({
      serviceId: undefined,
      optionId: undefined,
    });
    expect(narrow({})).toEqual({ serviceId: undefined, optionId: undefined });
  });

  it("browses rather than guessing when the URL names no service", async () => {
    const { router } = renderRoute("/booking/bk-1/details");

    await waitFor(() => expect(router.state.location.pathname).toBe("/services"));
  });

  it("sends an anonymous visitor to sign in, and back here afterwards", async () => {
    // The whole href, not the path: the service and the package are in the
    // query string, and a `next` that dropped them would return the customer
    // to a page that no longer knows what they were buying.
    const { router } = renderRoute("/booking/bk-1/details?serviceId=svc-1", { signedIn: false });

    await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
    expect(router.state.location.search).toMatchObject({
      next: "/booking/bk-1/details?serviceId=svc-1",
    });
  });

  it("starts a different booking over rather than carrying the last one's details", async () => {
    // The route keys the page by `bookingId`, and the page restores what the
    // customer typed from a store keyed by that same id. Without the key the
    // router reuses one match across a param change and React reconciles the
    // same component instance — so one booking's address and note would
    // survive onto another's page, which is precisely what keying the store
    // by booking exists to prevent.
    sessionStorage.setItem(
      "ntizo.checkout.bk-1",
      JSON.stringify({ addressId: "addr-1", description: "Portão azul" }),
    );
    const { router } = renderRoute("/booking/bk-1/details?serviceId=svc-1", { status: "DRAFT" });

    expect(await screen.findByLabelText(/o que precisa de ser feito/i)).toHaveValue(
      "Portão azul",
    );

    await router.navigate({
      to: "/booking/$bookingId/details",
      params: { bookingId: "bk-2" },
      search: { serviceId: "svc-1" },
    });

    // bk-2 has nothing stored, so the note starts empty rather than carrying
    // bk-1's.
    await waitFor(() =>
      expect(screen.getByLabelText(/o que precisa de ser feito/i)).toHaveValue(""),
    );
  });
});
