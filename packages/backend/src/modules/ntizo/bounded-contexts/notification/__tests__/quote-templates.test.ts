import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { infraStore } from "../../../../../shared/infrastructure/stores/infra-store";
import { TEMPLATE_REGISTRY } from "../infrastructure/templates/registry";
import { TEMPLATE_LOCALES } from "../infrastructure/templates/copy";
import { quoteReceivedTemplate } from "../infrastructure/templates/quote-received.template";

const SERVICE_NAME = "Instalação de ar condicionado";

/**
 * One payload carrying every field any of the seven quote templates reads,
 * mirroring `booking-templates.test.ts`'s single shared fixture. A template
 * that only reads a subset (all of them do — see each file's own doc
 * comment) simply ignores the rest.
 */
const payload = {
  quoteId: "q-1",
  bookingId: "bk-1",
  serviceName: SERVICE_NAME,
  priceMinor: 980000,
  currency: "MZN",
  startsAt: "2026-09-20T09:00:00.000Z",
  validUntil: "2026-09-10T16:40:00.000Z",
  payBy: "2026-09-07T09:15:00.000Z",
  respondBy: "2026-09-09T09:00:00.000Z",
  neededBy: "2026-09-20",
  reason: "outside_area",
  note: null,
  cause: "provider_did_not_respond",
  revision: false,
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

describe("quote templates", () => {
  it.each([
    NotificationType.QuoteReceived,
    NotificationType.QuoteAccepted,
    NotificationType.QuoteExpired,
    NotificationType.ProviderQuoteRequested,
    NotificationType.ProviderQuoteAccepted,
    NotificationType.ProviderQuoteSlotTaken,
  ])("%s renders in every locale and names the service", async (type) => {
    const template = TEMPLATE_REGISTRY[type];
    expect(template).toBeDefined();
    for (const locale of TEMPLATE_LOCALES) {
      const out = await withInfra(() => template!.render(locale, payload));
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.html).toContain(SERVICE_NAME);
      expect(out.text).toContain(SERVICE_NAME);
    }
  });

  /**
   * `QuoteDeclined` is the one type of the seven with no `serviceName` to
   * name: `DeclineQuoteCommand`'s `raiseQuietly` sends only `{ quoteId,
   * reason, note }` (see that command and `quoteDeclinedTemplate`'s own doc
   * comment). Asserting the service name here would assert a bug that
   * should never exist — the payload this type actually carries has nothing
   * to name. This still proves the fixture's `serviceName` is correctly
   * left unread.
   */
  it("QuoteDeclined renders in every locale without naming a service, since none is sent", async () => {
    const template = TEMPLATE_REGISTRY[NotificationType.QuoteDeclined];
    expect(template).toBeDefined();
    for (const locale of TEMPLATE_LOCALES) {
      const out = await withInfra(() => template!.render(locale, payload));
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.html).not.toContain(SERVICE_NAME);
      expect(out.text).not.toContain(SERVICE_NAME);
    }
  });

  it("states the price with a thousands separator in the platform's default locale", async () => {
    // ICU suppresses pt-MZ's group separator below five digits unless
    // grouping is requested explicitly — this is the regression the fix
    // guards against. The separator Intl actually emits for pt-MZ/pt-PT is
    // U+00A0 (no-break space), not U+0020, so the expected string is built
    // with it rather than typed as a plain space that would never match.
    const out = await withInfra(() =>
      quoteReceivedTemplate.render("pt-MZ", {
        quoteId: "q-1",
        serviceName: SERVICE_NAME,
        priceMinor: 980000,
        currency: "MZN",
        revision: false,
      }),
    );
    const expected = `9\u00A0800 MZN`;
    expect(out.html).toContain(expected);
    expect(out.text).toContain(expected);
  });

  it("a revision produces a different subject and heading than a first proposal", async () => {
    const base = { quoteId: "q-1", serviceName: SERVICE_NAME, priceMinor: 980000, currency: "MZN" };
    const first = await withInfra(() => quoteReceivedTemplate.render("pt-MZ", { ...base, revision: false }));
    const revised = await withInfra(() => quoteReceivedTemplate.render("pt-MZ", { ...base, revision: true }));
    expect(first.subject).not.toBe(revised.subject);
    // `text` is `${heading}\n\n${body}\n\n${url}` — its first line is the heading.
    expect(first.text.split("\n\n")[0]).not.toBe(revised.text.split("\n\n")[0]);
  });

  it("customer templates link to the quote or the booking, provider templates to the workspace", async () => {
    const received = await withInfra(() =>
      TEMPLATE_REGISTRY[NotificationType.QuoteReceived]!.render("pt-MZ", payload),
    );
    const accepted = await withInfra(() =>
      TEMPLATE_REGISTRY[NotificationType.QuoteAccepted]!.render("pt-MZ", payload),
    );
    const requested = await withInfra(() =>
      TEMPLATE_REGISTRY[NotificationType.ProviderQuoteRequested]!.render("pt-MZ", payload),
    );
    expect(received.text).toContain("/quotes/q-1");
    expect(accepted.text).toContain("/bookings/bk-1");
    expect(requested.text).toContain("/provider");
    expect(requested.text).not.toContain("/quotes/");
  });
});
