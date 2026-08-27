import { describe, expect, it } from "vitest";
import { serviceStubParts } from "../service-stub";
import type { ServiceDTO } from "../types";

const service = (over: Partial<ServiceDTO> = {}): ServiceDTO =>
  ({
    id: "s1",
    providerId: "p1",
    providerName: "Estúdio Mavalane",
    providerSlug: "estudio-mavalane",
    providerType: "organization",
    providerRatingAverage: 4.7,
    providerReviewCount: 6,
    categoryCode: "hair",
    categoryName: "Hair & beauty",
    name: "Haircut",
    description: null,
    locationType: "at_provider",
    bookingMode: "priced",
    imageUrls: [],
    defaultOption: {
      amountMinor: 80_000,
      currency: "MZN",
      durationMinutes: 45,
      minMinutes: null,
      stepMinutes: null,
      pricingMode: "fixed",
    },
    fromAmountMinor: 80_000,
    optionCount: 1,
    isFallback: false,
    ...over,
  }) as ServiceDTO;

describe("serviceStubParts", () => {
  it("shows a fixed price as an amount, with the job's own length under it", () => {
    expect(serviceStubParts(service())).toEqual({
      eyebrowKey: "filterPaymentOption.fixed",
      amount: { kind: "money", amountMinor: 80_000, currency: "MZN" },
      // `count`, not `minutes`: `serviceDurationMinutes` has interpolated
      // `{{count}}` in all eight locales since long before this card existed,
      // and three other call sites already pass it that way.
      under: { key: "serviceDurationMinutes", values: { count: 45 } },
      variant: "primary",
    });
  });

  it("shows an hourly price with the minimum booking, never a duration", () => {
    // An hourly option's durationMinutes is null precisely because the
    // customer decides how long the job runs. minMinutes is the only number
    // that option has to offer here.
    const parts = serviceStubParts(
      service({
        defaultOption: {
          amountMinor: 60_000,
          currency: "MZN",
          durationMinutes: null,
          minMinutes: 120,
          stepMinutes: 60,
          pricingMode: "hourly",
        },
      }),
    );
    expect(parts.eyebrowKey).toBe("filterPaymentOption.hourly");
    expect(parts.under).toEqual({ key: "serviceMinimumMinutes", values: { count: 120 } });
  });

  it("says the price is to be agreed on a quote service, and softens the button", () => {
    // A solid blue CTA beside a price of "to agree" promises a checkout that
    // does not exist for this service.
    const parts = serviceStubParts(
      service({ bookingMode: "quote", defaultOption: null, fromAmountMinor: null }),
    );
    expect(parts.amount).toEqual({ kind: "key", key: "stubQuoteAmount" });
    expect(parts.variant).toBe("quiet");
    expect(parts.under).toBeUndefined();
  });

  it("says 'from' only when there is more than one option to be from", () => {
    // With a single option, "from 800" invites the reader to look for a
    // cheaper price that cannot exist.
    expect(serviceStubParts(service({ optionCount: 1 })).eyebrowKey).toBe(
      "filterPaymentOption.fixed",
    );
    expect(
      serviceStubParts(service({ optionCount: 3, fromAmountMinor: 50_000 })).eyebrowKey,
    ).toBe("providerFrom");
  });

  it("carries no duration for a 'from' price, because it belongs to another option", () => {
    // The amount is the cheapest option's; the default option's "45 min" is a
    // fact about a different thing, and printing the two together reads as one.
    expect(
      serviceStubParts(service({ optionCount: 3, fromAmountMinor: 50_000 })).under,
    ).toBeUndefined();
  });

  it("does not call a priced service with no option a quote", () => {
    // Deactivating a service's last option leaves a published `priced`
    // service behind, and it looks exactly like a quote one on the wire.
    // Telling that customer to ask for a price is wrong advice, not merely a
    // mislabelled one — the price exists, its packages are (probably
    // temporarily) gone.
    const parts = serviceStubParts(
      service({ bookingMode: "priced", defaultOption: null, fromAmountMinor: null }),
    );
    expect(parts.amount).toEqual({ kind: "key", key: "priceUnavailable" });
    expect(parts.variant).toBe("quiet");
  });
});
