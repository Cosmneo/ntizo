import { describe, expect, it } from "vitest";
import {
  formatOptionAmount,
  optionDurationMinutes,
  servicePriceCell,
  serviceCardImage,
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
    categoryCode: "hair",
    name: "Corte de cabelo",
    description: null,
    locationType: "at_provider",
    bookingMode: "priced",
    imageUrls: [],
    defaultOption: option(),
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
