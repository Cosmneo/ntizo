import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { infraStore } from "../../../../../shared/infrastructure/stores/infra-store";
import { TEMPLATE_REGISTRY } from "../infrastructure/templates/registry";
import { TEMPLATE_LOCALES } from "../infrastructure/templates/copy";

const payload = {
  bookingId: "bk-1", serviceName: "Corte de cabelo", providerName: "Estúdio Mavalane",
  customerFirstName: "Ana", startsAt: "2026-09-05T09:00:00.000Z", payBy: "2026-09-04T11:00:00.000Z",
  respondBy: "2026-09-04T11:00:00.000Z", reason: "outside_area", priceMinor: 80000, currency: "MZN",
};

/**
 * Every template's `appBaseUrl()` reads `APP_URL` off the request-scoped
 * `infraStore` (see `copy.ts`), which throws when read outside a request on
 * purpose — see `templates.test.ts`'s own `TEST_ENV`/`withInfra` for the
 * same reasoning. A render call under test needs the same `runAsync` scope
 * real request handling provides.
 */
const TEST_ENV = {
  STAGE: "local" as const,
  LOG_LEVEL: "info",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "s",
  RESEND_API_KEY: "",
  EMAIL_FROM: "a@b.c",
  APP_URL: "https://ntizo.test",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
};

function withInfra<T>(fn: () => T): Promise<T> {
  return infraStore.runAsync(TEST_ENV, async () => fn());
}

describe("booking templates", () => {
  it.each([
    NotificationType.ProviderBookingReceived,
    NotificationType.BookingAccepted,
    NotificationType.BookingDeclined,
  ])("%s renders in every locale and names the service", async (type) => {
    const template = TEMPLATE_REGISTRY[type];
    expect(template).toBeDefined();
    for (const locale of TEMPLATE_LOCALES) {
      const out = await withInfra(() => template!.render(locale, payload));
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.html).toContain("Corte de cabelo");
      expect(out.text).toContain("Corte de cabelo");
    }
  });

  it("the received template links to the workspace's bookings, the customer ones to the customer's", async () => {
    const received = await withInfra(() =>
      TEMPLATE_REGISTRY[NotificationType.ProviderBookingReceived]!.render("pt-MZ", payload),
    );
    const accepted = await withInfra(() =>
      TEMPLATE_REGISTRY[NotificationType.BookingAccepted]!.render("pt-MZ", payload),
    );
    expect(received.text).toContain("/provider");
    expect(accepted.text).toContain("/bookings");
  });
});
