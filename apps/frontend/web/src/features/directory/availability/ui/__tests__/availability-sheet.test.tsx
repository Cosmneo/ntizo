import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ServiceAvailabilityDTO } from "@ntizo/shared/read-models";
import type { ServiceDTO } from "@/features/directory/services/domain/types";
import { AvailabilitySheet } from "../availability-sheet";

// The network layer, not the query cache: `AvailabilitySheet` computes its
// own `from`/`to` window from "today" (`weekOf(anchorDate)`), which is a
// moving target no test can pin a `queryKey` to. Replacing `publicGraphql`
// itself sidesteps that — every window asked for gets the same fixture, and
// what's under test is whether a name reaches the screen, not which week it
// landed on.
vi.mock("@/shared/lib/graphql/public-graphql", () => ({
  publicGraphql: vi.fn(),
}));

import { publicGraphql } from "@/shared/lib/graphql/public-graphql";

const SERVICE: ServiceDTO = {
  id: "svc-1",
  providerId: "prov-1",
  providerName: "Studio X",
  providerSlug: "studio-x",
  providerType: "organization",
  categoryCode: "hair",
  categoryName: "Hair",
  name: "Corte",
  description: null,
  locationType: "at_provider",
  bookingMode: "priced",
  imageUrls: [],
  defaultOption: {
    amountMinor: 50000,
    currency: "MZN",
    durationMinutes: 60,
    minMinutes: null,
    stepMinutes: null,
    pricingMode: "fixed",
  },
  fromAmountMinor: null,
  optionCount: 1,
  isFallback: false,
};

const AVAILABILITY: ServiceAvailabilityDTO = {
  serviceId: SERVICE.id,
  timezone: "Africa/Maputo",
  bookingMode: "priced",
  pricingMode: "fixed",
  memberIds: ["m1", "m2"],
  days: [],
};

function renderSheet(performers?: readonly { id: string; firstName: string }[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AvailabilitySheet
        service={SERVICE}
        performers={performers}
        open
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("AvailabilitySheet", () => {
  beforeEach(() => {
    vi.mocked(publicGraphql).mockResolvedValue({ availabilityForService: AVAILABILITY });
  });

  it("labels the roster with real first names when given performers", async () => {
    renderSheet([
      { id: "m1", firstName: "Ana" },
      { id: "m2", firstName: "Flávio" },
    ]);
    expect(await screen.findByRole("radio", { name: "Ana" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Flávio" })).toBeInTheDocument();
  });

  it("keeps the numbered fallback when mounted with no performers at all", async () => {
    // The shape `services-section.tsx` still mounts this sheet in today,
    // unmodified — this pins that the new prop being optional actually keeps
    // that call site working.
    renderSheet(undefined);
    expect(await screen.findByRole("radio", { name: "Professional 1" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Professional 2" })).toBeInTheDocument();
  });
});
