import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import * as client from "@/shared/lib/graphql/session-graphql";
import type { AvailabilityConfig } from "@/features/provider/availability/domain/types";
import type { ProviderSummary } from "@/features/provider/domain/types";
import type { CurrentUserDTO } from "@/features/user/domain/current-user";
import { ServiceWizardPage } from "../service-wizard-page";
import type { ProviderService } from "../../domain/types";

/**
 * The service wizard, rendered whole.
 *
 * Inherits its harness from the `service-editor-page` suite this replaces —
 * every query pre-seeded into the `QueryClient` cache (`staleTime: Infinity`
 * keeps the seed from being refetched away) rather than mocked at the network
 * layer, so what is under test is the wiring rather than a pile of stubs.
 *
 * What is new is what the wizard changed: a step list that varies per service,
 * a rail that only lets an unsaved service go backwards, and a save that fires
 * on the way out of one designated step rather than from a bar that is always
 * on screen.
 */

const PROVIDER: ProviderSummary = {
  id: "p1",
  name: "Bela Vista Studio",
  slug: "bela-vista",
  type: "organization",
  status: "active",
  role: "owner",
};

const INDIVIDUAL_PROVIDER: ProviderSummary = { ...PROVIDER, type: "individual" };

const ORG_AVAILABILITY: AvailabilityConfig = {
  providerId: PROVIDER.id,
  timezone: "Africa/Maputo",
  members: [
    { memberId: "m1", userId: "u1", name: "Ana", role: "owner", weekly: [], exceptions: [] },
    { memberId: "m2", userId: "u2", name: "Beto", role: "staff", weekly: [], exceptions: [] },
  ],
  closures: [],
};

const INDIVIDUAL_AVAILABILITY: AvailabilityConfig = {
  providerId: PROVIDER.id,
  timezone: "Africa/Maputo",
  members: [{ memberId: "m1", userId: "u1", name: "Ana", role: "owner", weekly: [], exceptions: [] }],
  closures: [],
};

const CURRENT_USER: CurrentUserDTO = {
  id: "u1",
  email: "ana@example.com",
  role: "organization_owner",
  status: "active",
  createdAt: "2024-01-01T00:00:00.000Z",
  name: "Ana",
  firstName: "Ana",
  lastName: "M",
  displayName: "Ana",
  avatarUrl: null,
  phoneNumber: null,
  bio: null,
  language: "en-US",
  timezone: "Africa/Maputo",
  dateOfBirth: null,
  gender: null,
};

const CATEGORIES = [
  { id: "cat-1", code: "HAIR", name: "Haircut" },
  { id: "cat-2", code: "CLEAN", name: "Cleaning" },
];

/** A service already on the server, priced, with no options yet. */
const SAVED_SERVICE: ProviderService = {
  id: "svc-1",
  categoryId: "cat-1",
  categoryCode: "HAIR",
  sourceLocale: "en-US",
  locationType: "at_provider",
  bookingMode: "priced",
  status: "draft",
  imageUrls: [],
  translations: [{ locale: "en-US", name: "Haircut", description: null }],
  options: [],
  bufferMinutes: 0,
  slotIntervalMinutes: 30,
  memberIds: ["m1"],
};

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

function seed(
  qc: QueryClient,
  opts: {
    provider?: ProviderSummary;
    services?: ProviderService[];
    availability?: AvailabilityConfig;
    currentUser?: CurrentUserDTO;
  } = {},
) {
  const provider = opts.provider ?? PROVIDER;
  qc.setQueryData(["providers", "mine"], [provider]);
  qc.setQueryData(["provider", "services", provider.id], opts.services ?? []);
  qc.setQueryData(
    ["provider", "availability", provider.id],
    opts.availability ?? (provider.type === "individual" ? INDIVIDUAL_AVAILABILITY : ORG_AVAILABILITY),
  );
  qc.setQueryData(["user", "me"], opts.currentUser ?? CURRENT_USER);
  qc.setQueryData(["provider", "services", "categories", "en-US"], CATEGORIES);
}

function renderWizard(path: string, qc: QueryClient) {
  const rootRoute = createRootRoute();
  const slugRoute = createRoute({ getParentRoute: () => rootRoute, path: "/provider/$slug" });
  const servicesListRoute = createRoute({
    getParentRoute: () => slugRoute,
    path: "/services",
    component: () => <div>services list</div>,
  });
  const wizardRoute = createRoute({
    getParentRoute: () => slugRoute,
    path: "/services/$serviceId",
    component: ServiceWizardPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([slugRoute.addChildren([servicesListRoute, wizardRoute])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** The rail row for a step, by its label. */
const railRow = (name: RegExp) => screen.getByRole("button", { name });

afterEach(() => vi.restoreAllMocks());

describe("ServiceWizardPage", () => {
  it("a new service opens on the essentials, asked as a question", async () => {
    const qc = makeQueryClient();
    seed(qc);

    renderWizard("/provider/bela-vista/services/new", qc);

    expect(
      await screen.findByRole("heading", { name: "What service are you offering?" }),
    ).toBeInTheDocument();
    expect(railRow(/The essentials/)).toHaveAttribute("aria-current", "step");
  });

  it("an organization walks all six steps", async () => {
    const qc = makeQueryClient();
    seed(qc);

    renderWizard("/provider/bela-vista/services/new", qc);

    await screen.findByRole("heading", { name: "What service are you offering?" });
    for (const label of [
      /The essentials/,
      /How it is charged/,
      /Who does it/,
      /Prices/,
      /Languages/,
      /Check and publish/,
    ]) {
      expect(railRow(label)).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /Timing/ })).not.toBeInTheDocument();
  });

  it("an individual provider is never shown the performers step", async () => {
    const qc = makeQueryClient();
    seed(qc, { provider: INDIVIDUAL_PROVIDER, availability: INDIVIDUAL_AVAILABILITY });

    renderWizard("/provider/bela-vista/services/new", qc);

    await screen.findByRole("heading", { name: "What service are you offering?" });
    expect(screen.queryByRole("button", { name: /Who does it/ })).not.toBeInTheDocument();
  });

  it("counts the steps this service actually has", async () => {
    const qc = makeQueryClient();
    seed(qc, { provider: INDIVIDUAL_PROVIDER, availability: INDIVIDUAL_AVAILABILITY });

    renderWizard("/provider/bela-vista/services/new", qc);

    // Five, not six: an individual provider skips performers. Telling them
    // "1 of 6" would count a screen they will never be shown.
    expect(await screen.findByText("Step 1/5")).toBeInTheDocument();
  });

  it("an unsaved service cannot jump forward past the step that creates it", async () => {
    const qc = makeQueryClient();
    seed(qc);
    const user = userEvent.setup();

    renderWizard("/provider/bela-vista/services/new", qc);

    await screen.findByRole("heading", { name: "What service are you offering?" });
    await user.click(railRow(/Prices/));

    // Still on the essentials — `Prices` writes options against a service id
    // that does not exist yet.
    expect(railRow(/The essentials/)).toHaveAttribute("aria-current", "step");
  });

  it("a saved service may jump straight to any step", async () => {
    const qc = makeQueryClient();
    seed(qc, { services: [SAVED_SERVICE] });
    const user = userEvent.setup();

    renderWizard("/provider/bela-vista/services/svc-1", qc);

    await screen.findByRole("heading", { name: "What service are you offering?" });
    await user.click(railRow(/Check and publish/));

    expect(railRow(/Check and publish/)).toHaveAttribute("aria-current", "step");
  });

  it("the essentials refuse to advance until they are answered", async () => {
    const qc = makeQueryClient();
    seed(qc);
    const user = userEvent.setup();
    const spy = vi.spyOn(client, "sessionGraphql");

    renderWizard("/provider/bela-vista/services/new", qc);

    await user.type(await screen.findByPlaceholderText("e.g. Haircut"), "Corte");
    // Category and location still unanswered.
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(railRow(/The essentials/)).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Answer everything above before continuing.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("walking the essentials writes nothing to the server", async () => {
    // The service is created on the way out of `booking`, not before it —
    // creating earlier leaves a half-built row behind every abandoned attempt.
    const qc = makeQueryClient();
    seed(qc);
    const user = userEvent.setup();
    const spy = vi.spyOn(client, "sessionGraphql");

    renderWizard("/provider/bela-vista/services/new", qc);

    await answerEssentials(user);
    await user.click(screen.getByRole("button", { name: "Continue" })); // → booking

    expect(await screen.findByRole("heading", { name: "How is it charged?" })).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("advancing off the booking step creates the service and moves on", async () => {
    const qc = makeQueryClient();
    seed(qc);
    const user = userEvent.setup();
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValue({ serviceCreate: { serviceId: "svc-new" } } as never);

    renderWizard("/provider/bela-vista/services/new", qc);

    await answerEssentials(user);
    await user.click(screen.getByRole("button", { name: "Continue" })); // → booking
    await user.click(await screen.findByRole("button", { name: "Continue" })); // creates, → performers

    expect(spy).toHaveBeenCalled();
    // Landed on the next step rather than being thrown back to step one by the
    // route's `new` → real-id swap.
    expect(await screen.findByRole("heading", { name: "Who performs it?" })).toBeInTheDocument();
    expect(railRow(/Who does it/)).toHaveAttribute("aria-current", "step");
  });

  it("an organization whose creator is a member starts with them already performing it", async () => {
    const qc = makeQueryClient();
    seed(qc); // CURRENT_USER is u1, which is member m1
    const user = userEvent.setup();
    // Advancing off `booking` now creates the service, so this needs a real
    // response to move past it.
    vi.spyOn(client, "sessionGraphql").mockResolvedValue({
      serviceCreate: { serviceId: "svc-new" },
    } as never);

    renderWizard("/provider/bela-vista/services/new", qc);

    await answerEssentials(user);
    await user.click(screen.getByRole("button", { name: "Continue" })); // → booking
    await user.click(await screen.findByRole("button", { name: "Continue" })); // creates, → performers

    await screen.findByRole("heading", { name: "Who performs it?" });
    // Ana is member m1, backfilled by the effect that waits on the
    // availability config resolving after the draft was seeded.
    expect(screen.getByRole("checkbox", { name: "Ana" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Beto" })).not.toBeChecked();
  });

  it("a saved service persists on the way out of the essentials", async () => {
    // What makes the wizard usable as an editor: changing one field and
    // moving on should stick, without walking to the end.
    const qc = makeQueryClient();
    seed(qc, { services: [SAVED_SERVICE] });
    const user = userEvent.setup();
    const spy = vi.spyOn(client, "sessionGraphql").mockResolvedValue({} as never);

    renderWizard("/provider/bela-vista/services/svc-1", qc);

    const name = await screen.findByPlaceholderText("e.g. Haircut");
    await user.clear(name);
    await user.type(name, "Corte de cabelo");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(spy).toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "How is it charged?" })).toBeInTheDocument();
  });

  it("publish is disabled while something still blocks it", async () => {
    const qc = makeQueryClient();
    seed(qc, { services: [SAVED_SERVICE] }); // priced, zero options
    const user = userEvent.setup();

    renderWizard("/provider/bela-vista/services/svc-1", qc);

    await screen.findByRole("heading", { name: "What service are you offering?" });
    await user.click(railRow(/Check and publish/));

    expect(await screen.findByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("the review step names what is blocking publish and goes there", async () => {
    const qc = makeQueryClient();
    seed(qc, { services: [SAVED_SERVICE] });
    const user = userEvent.setup();

    renderWizard("/provider/bela-vista/services/svc-1", qc);

    await screen.findByRole("heading", { name: "What service are you offering?" });
    await user.click(railRow(/Check and publish/));

    const blocker = await screen.findByRole("button", {
      name: "A priced service needs at least one option before it can be published.",
    });
    await user.click(blocker);

    // It did not merely complain — it took them to the step that fixes it.
    expect(await screen.findByRole("heading", { name: "What does it cost?" })).toBeInTheDocument();
  });

  it("a quote service is never asked for prices", async () => {
    const qc = makeQueryClient();
    seed(qc, { services: [{ ...SAVED_SERVICE, bookingMode: "quote" }] });

    renderWizard("/provider/bela-vista/services/svc-1", qc);

    await screen.findByRole("heading", { name: "What service are you offering?" });
    expect(screen.queryByRole("button", { name: /Prices/ })).not.toBeInTheDocument();
  });
});

/** Fills in the three answers step 1 refuses to move on without. */
async function answerEssentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByPlaceholderText("e.g. Haircut"), "Corte");
  await pickCategory(user, /Haircut/);
  await user.click(screen.getByRole("radio", { name: "Remotely" }));
}

/**
 * Opens the category dropdown and chooses a row.
 *
 * The trigger's accessible name is the field's label — `Field` renders a
 * `<label for>` and a `<button>` is labelable, so the label names the control
 * rather than the placeholder does. That is the correct reading of the two:
 * "Choose a category" is the current *value* standing in for an empty one.
 */
async function pickCategory(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole("button", { name: "Category" }));
  await user.click(await screen.findByRole("option", { name }));
}

describe("the category field", () => {
  it("is a dropdown rather than a row of chips", async () => {
    // A marketplace-wide taxonomy is not a set you scan — chips put every
    // category on screen at once and pushed the rest of the step below it.
    const qc = makeQueryClient();
    seed(qc);

    renderWizard("/provider/bela-vista/services/new", qc);

    await screen.findByPlaceholderText("e.g. Haircut");
    const trigger = screen.getByRole("button", { name: "Category" });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    // Nothing chosen yet, so the trigger stands in with the placeholder.
    expect(trigger).toHaveTextContent("Choose a category");
    expect(screen.queryByRole("radio", { name: /Haircut/ })).not.toBeInTheDocument();
  });

  it("offers a search box, however short the list happens to be", async () => {
    // Forced on rather than left to the component's own length threshold:
    // the two categories a test seeds are not the number a real marketplace
    // carries, and the box should not appear only in production.
    const qc = makeQueryClient();
    seed(qc);
    const user = userEvent.setup();

    renderWizard("/provider/bela-vista/services/new", qc);

    await user.click(await screen.findByRole("button", { name: "Category" }));

    expect(screen.getByPlaceholderText("Search category")).toBeInTheDocument();
  });

  it("filters as you type", async () => {
    const qc = makeQueryClient();
    seed(qc);
    const user = userEvent.setup();

    renderWizard("/provider/bela-vista/services/new", qc);

    await user.click(await screen.findByRole("button", { name: "Category" }));
    await user.type(screen.getByPlaceholderText("Search category"), "clean");

    expect(screen.getByRole("option", { name: /Cleaning/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Haircut/ })).not.toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    const qc = makeQueryClient();
    seed(qc);
    const user = userEvent.setup();

    renderWizard("/provider/bela-vista/services/new", qc);

    await user.click(await screen.findByRole("button", { name: "Category" }));
    await user.type(screen.getByPlaceholderText("Search category"), "plumbing");

    expect(screen.getByText("No category found.")).toBeInTheDocument();
  });

  it("shows the chosen category on the trigger afterwards", async () => {
    const qc = makeQueryClient();
    seed(qc);
    const user = userEvent.setup();

    renderWizard("/provider/bela-vista/services/new", qc);

    await screen.findByPlaceholderText("e.g. Haircut");
    await pickCategory(user, /Cleaning/);

    expect(screen.getByRole("button", { name: "Category" })).toHaveTextContent("Cleaning");
    expect(screen.getByRole("button", { name: "Category" })).not.toHaveTextContent(
      "Choose a category",
    );
  });
});
