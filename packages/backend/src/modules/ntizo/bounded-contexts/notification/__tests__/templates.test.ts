import { describe, expect, it } from "bun:test";
import { NotificationType } from "@ntizo/shared";
import { infraStore } from "../../../../../shared/infrastructure/stores/infra-store";
import { TEMPLATE_LOCALES } from "../infrastructure/templates/copy";
import { TEMPLATE_REGISTRY } from "../infrastructure/templates/registry";
import { LocalTemplateRenderer } from "../infrastructure/outbound-adapters/template-renderer.adapter";

const renderer = new LocalTemplateRenderer();

/**
 * Every template links back into the app, via `appBaseUrl()` reading
 * `APP_URL` off the request-scoped `infraStore` (see `copy.ts`). That store
 * throws when read outside a request on purpose — `connection.test.ts`
 * asserts exactly that, "instead of leaking another request's env" — so a
 * render call under test needs the same `runAsync` scope real request
 * handling provides. Fields beyond `APP_URL` are unused by any template here
 * but required by `InfraEnvBindings`.
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
  MICROSOFT_CLIENT_ID: "",
  MICROSOFT_CLIENT_SECRET: "",
};

function withInfra<T>(fn: () => T): Promise<T> {
  return infraStore.runAsync(TEST_ENV, async () => fn());
}

/** One payload per type, matching what Phase 1's handlers actually raise. */
const PAYLOADS: Record<string, Record<string, unknown>> = {
  [NotificationType.Welcome]: { firstName: "Ana" },
  [NotificationType.ProviderWorkspaceWelcome]: { type: "organization" },
  [NotificationType.ProviderVerified]: { from: "pending", to: "active" },
  [NotificationType.ProviderDocumentsRequired]: { from: "pending", to: "rejected" },
  [NotificationType.TeamInvitation]: {
    providerId: "p1",
    providerName: "Salão X",
    role: "staff",
  },
};

describe("every template renders in every locale", () => {
  for (const [type, mod] of Object.entries(TEMPLATE_REGISTRY)) {
    for (const locale of TEMPLATE_LOCALES) {
      it(`${type} renders in ${locale}`, async () => {
        const out = await withInfra(() => mod!.render(locale, PAYLOADS[type]!));
        expect(out.subject.trim().length).toBeGreaterThan(0);
        expect(out.html.trim().length).toBeGreaterThan(0);
        expect(out.text.trim().length).toBeGreaterThan(0);
        // An unreplaced placeholder is the failure this whole table-driven
        // test exists to catch: it renders, it looks fine in review, and it
        // ships "{{providerName}}" to a customer.
        expect(out.subject).not.toMatch(/\{\{|\}\}|undefined|\[object/);
        expect(out.html).not.toMatch(/\{\{|\}\}|undefined|\[object/);
        expect(out.text).not.toMatch(/\{\{|\}\}|undefined|\[object/);
      });
    }
  }
});

describe("the locale fallback", () => {
  it("gives a Brazilian reader Portuguese, not English", async () => {
    const pt = (await withInfra(() =>
      renderer.render(NotificationType.Welcome, "pt-BR", { firstName: "Ana" }),
    ))!;
    const en = (await withInfra(() =>
      renderer.render(NotificationType.Welcome, "en-US", { firstName: "Ana" }),
    ))!;
    expect(pt.subject).not.toBe(en.subject);
  });

  it("falls all the way back to English for a language nobody wrote", async () => {
    const ja = (await withInfra(() =>
      renderer.render(NotificationType.Welcome, "ja-JP", { firstName: "Ana" }),
    ))!;
    const en = (await withInfra(() =>
      renderer.render(NotificationType.Welcome, "en-US", { firstName: "Ana" }),
    ))!;
    expect(ja.subject).toBe(en.subject);
  });
});

describe("a type with no template", () => {
  it("returns null rather than throwing", () => {
    // A type can reach an inbox before anybody writes its email. That must
    // leave the inbox row standing, not fail the raise that created it. No
    // template is registered for it, so it returns before ever touching
    // `infraStore` — no request scope needed for this one.
    expect(renderer.render(NotificationType.BookingConfirmed, "en-US", {})).toBeNull();
  });
});

describe("payload-derived text is escaped before it reaches HTML", () => {
  // `emailLayout` interpolates `heading` raw into `<h1>` — it does no
  // escaping of its own (read `layout.ts`; there is none). Every value a
  // person or a provider typed that reaches a heading or body must therefore
  // be escaped by the template before it gets there, or this exact payload
  // becomes a live `onerror` handler inside an email sent from Ntizo's own
  // domain, in a message the recipient has every reason to trust.
  const XSS_PAYLOAD = '<img src=x onerror="alert(1)">';

  it("escapes an attacker-shaped firstName in welcome's heading", async () => {
    const out = (await withInfra(() =>
      renderer.render(NotificationType.Welcome, "en-US", { firstName: XSS_PAYLOAD }),
    ))!;
    expect(out.html).not.toContain("<img");
  });

  it("escapes an attacker-shaped providerName in team-invitation's heading", async () => {
    const out = (await withInfra(() =>
      renderer.render(NotificationType.TeamInvitation, "en-US", {
        providerId: "p1",
        providerName: XSS_PAYLOAD,
        role: "staff",
      }),
    ))!;
    expect(out.html).not.toContain("<img");
  });
});
