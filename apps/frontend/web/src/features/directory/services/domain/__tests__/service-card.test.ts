import { describe, expect, it } from "vitest";
import type { ServiceDetailDTO, ServiceDetailOptionDTO } from "@ntizo/shared/read-models";
import {
  formatAmount,
  formatHeadlinePrice,
  formatOptionAmount,
  optionDurationMinutes,
  servicePriceCell,
  serviceCardImage,
  serviceDetailPanel,
} from "../service-card";
import type { ServiceDTO, ServicePublicOptionDTO } from "../types";

function option(over: Partial<ServicePublicOptionDTO> = {}): ServicePublicOptionDTO {
  return {
    amountMinor: 30000,
    currency: "MZN",
    durationMinutes: 30,
    minMinutes: null,
    stepMinutes: null,
    pricingMode: "fixed",
    ...over,
  };
}

function service(over: Partial<ServiceDTO> = {}): ServiceDTO {
  return {
    id: "svc-1",
    providerId: "prov-1",
    providerName: "Barbearia Central",
    providerSlug: "barbearia",
    providerType: "organization",
    providerVerified: false,
    providerRatingAverage: 4.7,
    providerReviewCount: 12,
    categoryCode: "hair",
    categoryName: "Cabeleireiro",
    name: "Corte de cabelo",
    description: null,
    locationType: "at_provider",
    bookingMode: "priced",
    imageUrls: [],
    defaultOption: option(),
    fromAmountMinor: 30000,
    optionCount: 1,
    isFallback: false,
    ...over,
  };
}

describe("servicePriceCell", () => {
  it("a fixed service's card shows the default option's price and duration", () => {
    const opt = option({ amountMinor: 30000, currency: "MZN", durationMinutes: 30, pricingMode: "fixed" });
    const svc = service({ bookingMode: "priced", defaultOption: opt });

    const cell = servicePriceCell(svc);

    expect(cell).toEqual({ kind: "priced", option: opt });
    expect(cell.kind).toBe("priced");
    if (cell.kind === "priced") {
      expect(formatOptionAmount(cell.option, "pt-MZ")).toMatch(/300/);
      expect(optionDurationMinutes(cell.option)).toBe(30);
    }
  });

  it("a service with several options shows the default one, not the first", () => {
    // `service.all` already resolves an entire options list down to one
    // `defaultOption` server-side (see `servicePublicOptionReadModel`) —
    // this is what "several options" collapses to by the time it reaches
    // this layer. There is no `options[0]` on the wire to mis-index into;
    // what this asserts is that the card surfaces `defaultOption`'s own
    // fields unchanged, using numbers deliberately unlike the other test's
    // fixture so a hardcoded or mixed-up field would be caught.
    const theDefault = option({ amountMinor: 45000, currency: "MZN", durationMinutes: 45, pricingMode: "fixed" });
    const svc = service({ bookingMode: "priced", defaultOption: theDefault });

    const cell = servicePriceCell(svc);

    expect(cell).toEqual({ kind: "priced", option: theDefault });
    if (cell.kind === "priced") {
      expect(formatOptionAmount(cell.option, "pt-MZ")).toMatch(/450/);
      expect(optionDurationMinutes(cell.option)).toBe(45);
    }
  });

  it("a quote service shows 'by quote' instead of a price", () => {
    // Branch on bookingMode, never on "is there a default option" — slice 1
    // shipped that mistake and a priced service with no options yet read as
    // "by quote".
    const svc = service({ bookingMode: "quote", defaultOption: null });

    expect(servicePriceCell(svc)).toEqual({ kind: "quote" });
  });

  it("a priced service with no options yet is NOT read as a quote service", () => {
    // The exact defect slice 1 shipped: a `priced` service between being
    // created and getting its first option is still a priced service, not a
    // quote one. `service.all` never actually publishes this state
    // (`canPublish` refuses a `priced` service with no options), but the
    // branch must still be correct defensively.
    const svc = service({ bookingMode: "priced", defaultOption: null });

    expect(servicePriceCell(svc)).toEqual({ kind: "unavailable" });
    expect(servicePriceCell(svc)).not.toEqual({ kind: "quote" });
  });

  it("an hourly service shows its minimum and its rate", () => {
    const opt = option({
      amountMinor: 25000,
      currency: "MZN",
      durationMinutes: null,
      minMinutes: 120,
      pricingMode: "hourly",
    });
    const svc = service({ bookingMode: "priced", defaultOption: opt });

    const cell = servicePriceCell(svc);

    expect(cell.kind).toBe("priced");
    if (cell.kind === "priced") {
      // The two must not read alike: one is the whole job's price, the
      // other is what an hour of it costs — a customer who confuses them is
      // a dispute, not a UI nitpick. This function returns the bare amount;
      // the "/h" suffix is the UI's translated string, not this layer's.
      expect(formatOptionAmount(cell.option, "pt-MZ")).toMatch(/250/);
      expect(optionDurationMinutes(cell.option)).toBe(120);
    }
  });
});

/**
 * The headline-vs-total split: `formatHeadlinePrice` rounds to whole units,
 * `formatAmount` keeps the decimals a checkout total cannot drop. Same
 * `amountMinor`, same locale, so this is a direct comparison rather than two
 * assertions that happen to agree.
 */
describe("formatHeadlinePrice", () => {
  it("prints whole units, unlike formatAmount's checkout precision", () => {
    const headline = formatHeadlinePrice(120000, "MZN", "pt-MZ");
    const total = formatAmount(120000, "MZN", "pt-MZ");

    expect(headline).not.toContain(",00");
    expect(total).toContain(",00");
  });

  it("groups a four-digit amount even where the locale's own default would not", () => {
    // `pt-MZ` and `pt-PT` set `minimumGroupingDigits: 2`, so a bare
    // `Intl.NumberFormat` call leaves a four-digit price ungrouped —
    // `useGrouping: "always"` is what makes "1200" read as "1 200".
    expect(formatHeadlinePrice(120000, "MZN", "pt-MZ")).toMatch(/1[\s.,]200/);
  });
});

describe("serviceCardImage", () => {
  it("a service with no image falls back to the provider's", () => {
    const svc = service({ imageUrls: [] });

    expect(serviceCardImage(svc, "https://cdn.ntizo.test/provider-logo.png")).toBe(
      "https://cdn.ntizo.test/provider-logo.png",
    );
  });

  it("uses the service's own image when it has one, not the provider's", () => {
    const svc = service({ imageUrls: ["https://cdn.ntizo.test/service-photo.jpg"] });

    expect(serviceCardImage(svc, "https://cdn.ntizo.test/provider-logo.png")).toBe(
      "https://cdn.ntizo.test/service-photo.jpg",
    );
  });

  it("is null when neither the service nor the provider has one", () => {
    const svc = service({ imageUrls: [] });

    expect(serviceCardImage(svc, null)).toBeNull();
  });
});

/**
 * What the card leads with when a service has more than one package.
 *
 * The reason this exists at all: the browse used to print the provider's
 * *default* option, so a service whose packages ran 350 / 500 / 850 with the
 * middle one marked default advertised 500 — and the price filter, matching on
 * the cheapest, would hand that service back to somebody who asked for "under
 * 400". The number on the card and the number the filter matches have to be
 * the same one.
 */
describe("servicePriceCell with several options", () => {
  it("leads with the cheapest, not the default", () => {
    const cell = servicePriceCell(
      service({
        defaultOption: option({ amountMinor: 50000 }),
        fromAmountMinor: 35000,
        optionCount: 3,
      }),
    );
    expect(cell).toEqual({ kind: "from", amountMinor: 35000, currency: "MZN" });
  });

  it("says nothing about 'from' when there is only one option", () => {
    // "from 500 MZN" when 500 is the only price it can ever be invites the
    // reader to hunt for a cheaper one that does not exist.
    const cell = servicePriceCell(
      service({ defaultOption: option({ amountMinor: 50000 }), fromAmountMinor: 50000, optionCount: 1 }),
    );
    expect(cell.kind).toBe("priced");
  });

  it("stays a quote even with options somehow attached", () => {
    // `quote` short-circuits before anything priced is inspected: the price is
    // not knowable until the provider has seen the job, whatever rows exist.
    const cell = servicePriceCell(
      service({ bookingMode: "quote", fromAmountMinor: 35000, optionCount: 4 }),
    );
    expect(cell.kind).toBe("quote");
  });

  it("falls back to the default option when the cheapest is missing", () => {
    // A count above one with no minimum is data that cannot be true; showing
    // the default is better than showing "from undefined".
    const cell = servicePriceCell(
      service({ defaultOption: option(), fromAmountMinor: null, optionCount: 3 }),
    );
    expect(cell.kind).toBe("priced");
  });
});

function detailOption(over: Partial<ServiceDetailOptionDTO> = {}): ServiceDetailOptionDTO {
  return {
    id: "opt-1",
    name: "Cerimónia",
    amountMinor: 35000,
    currency: "MZN",
    durationMinutes: 60,
    minMinutes: null,
    stepMinutes: null,
    pricingMode: "fixed",
    isDefault: true,
    ...over,
  };
}

function detailService(over: Partial<ServiceDetailDTO> = {}): ServiceDetailDTO {
  return {
    id: "svc-1",
    providerId: "prov-1",
    providerName: "Barbearia Central",
    providerSlug: "barbearia",
    providerType: "organization",
    providerLogoUrl: null,
    providerCity: "Maputo",
    providerDistrict: null,
    categoryCode: "hair",
    categoryName: "Cabeleireiro",
    name: "Corte de cabelo",
    description: null,
    locationType: "at_provider",
    bookingMode: "priced",
    imageUrls: [],
    options: [detailOption()],
    performers: [],
    isFallback: false,
    ...over,
  };
}

/**
 * `service-detail-page.tsx`'s three-way split for its right column.
 *
 * The middle case is the one the whole-branch review found and per-task
 * review could not: `service-detail-page.tsx` used to branch on
 * `options.length === 0` directly, which reads a `priced` service that has
 * lost its last *active* option — a state `canPublish` cannot prevent after
 * publish time, since it only ever runs once, at publish — as a `quote`
 * service. It never had a price to begin with in that misreading, which is
 * false: the price exists, only the packages are gone.
 */
describe("serviceDetailPanel", () => {
  it("shows the package chooser for a priced service with active options", () => {
    expect(serviceDetailPanel(detailService())).toEqual({ kind: "packages" });
  });

  it("shows the quote notice for a quote service", () => {
    expect(
      serviceDetailPanel(detailService({ bookingMode: "quote", options: [] })),
    ).toEqual({ kind: "quote" });
  });

  it("a priced service with no active options is read as unavailable, never as a quote service", () => {
    // The exact defect this fix wave closes.
    const panel = serviceDetailPanel(detailService({ bookingMode: "priced", options: [] }));
    expect(panel).toEqual({ kind: "unavailable" });
    expect(panel).not.toEqual({ kind: "quote" });
  });

  it("stays a quote even with options somehow attached", () => {
    // Mirrors `servicePriceCell`'s own guard: `quote` short-circuits before
    // `options` is even inspected.
    expect(
      serviceDetailPanel(detailService({ bookingMode: "quote", options: [detailOption()] })),
    ).toEqual({ kind: "quote" });
  });
});
