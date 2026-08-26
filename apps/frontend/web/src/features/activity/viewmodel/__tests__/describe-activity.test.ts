import { describe, expect, it } from "vitest";
import i18n, { SUPPORTED_LOCALES } from "@/shared/lib/i18n";
import type { ActivityEntry } from "../../domain/types";
import { describeActivity } from "../describe-activity";

function entry(type: string, payload: Record<string, unknown>): ActivityEntry {
  return { id: "a1", type, payload, occurredAt: "2026-08-26T10:00:00Z" };
}

/**
 * Real translation resources throughout, via `i18n.getFixedT`, not a fake
 * `t` — a stub that returns the key would prove nothing about capitalisation
 * of the actual French/Dutch copy, which is the entire point of this file.
 */
describe("describeActivity", () => {
  it("capitalises a fallback that lands at the front of the sentence", () => {
    // fr-FR and nl-NL put the interpolated name first in several keys
    // ("{{serviceName}} publié", "{{serviceName}} gepubliceerd"). The
    // fallback noun in the JSON is lowercase ("un service", "een dienst") —
    // correct mid-sentence, wrong sentence-initial, and `EntryRow` has no
    // `text-transform` to paper over it.
    const fr = i18n.getFixedT("fr-FR", "account");
    expect(describeActivity(fr, entry("service.published", { serviceName: null }))).toBe(
      "Un service publié",
    );

    const nl = i18n.getFixedT("nl-NL", "account");
    expect(describeActivity(nl, entry("service.published", { serviceName: null }))).toBe(
      "Een dienst gepubliceerd",
    );
  });

  it("leaves a verb-first fallback's capital exactly where the template put it", () => {
    // "Rejoint {{providerName}}" already starts with a capital; capitalising
    // "the first character" again must be a no-op here, not a second
    // uppercase letter or a corrupted mid-sentence "Un prestataire".
    const fr = i18n.getFixedT("fr-FR", "account");
    expect(
      describeActivity(fr, entry("provider.invite.accepted", { providerName: null })),
    ).toBe("Rejoint un prestataire");
  });

  it("never touches a real name someone chose", () => {
    // The exact case the fix must not break: a service genuinely named
    // starting lowercase is not a fallback and stays exactly as typed, in
    // whichever position the sentence puts it.
    const fr = i18n.getFixedT("fr-FR", "account");
    expect(
      describeActivity(fr, entry("service.published", { serviceName: "iPhone repair" })),
    ).toBe("iPhone repair publié");

    const en = i18n.getFixedT("en-US", "account");
    expect(
      describeActivity(en, entry("service.published", { serviceName: "iPhone repair" })),
    ).toBe("Published iPhone repair");
  });

  it("does not fire on a field the event type never carries", () => {
    // `providerName` is simply absent — not null — from a service.published
    // payload. Reading that as "a fallback happened" would force a capital
    // that was never warranted onto an already-correct sentence.
    const en = i18n.getFixedT("en-US", "account");
    expect(
      describeActivity(en, entry("service.published", { serviceName: "haircut" })),
    ).toBe("Published haircut");
  });
});

/**
 * The whole-branch-review finding: `provider.event-handlers.ts` snapshots
 * `to` (the `ProviderStatus` an admin decided on — `active`, `rejected`,
 * `suspended` or `archived`; `decide()` never targets `pending`) onto every
 * `provider.status.decided` row, but until now no copy read it. An admin who
 * rejected one provider and approved another produced two rows that read
 * identically: "Reviewed {{providerName}}" for both, in every locale — a
 * compliance audit trail that cannot tell an approval from a rejection.
 *
 * `describeActivity` now passes `entry.payload.to` as i18next `context`, so
 * these assertions are a direct mutation test: comment out the `context`
 * line in `describe-activity.ts` and every `not.toBe` below turns red,
 * because "approved" and "rejected" collapse back to the same base-key
 * sentence. Confirmed by hand before writing this file.
 */
describe("provider.status.decided is outcome-aware", () => {
  it("renders a real approval and a real rejection as different sentences, in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const t = i18n.getFixedT(locale, "account");
      const name = "Barbearia do João";
      const approved = describeActivity(
        t,
        entry("provider.status.decided", { providerName: name, to: "active" }),
      );
      const rejected = describeActivity(
        t,
        entry("provider.status.decided", { providerName: name, to: "rejected" }),
      );
      expect(approved, `${locale}: approved vs rejected`).not.toBe(rejected);
      expect(approved, `${locale}: approved keeps the name`).toContain(name);
      expect(rejected, `${locale}: rejected keeps the name`).toContain(name);
    }
  });

  it("gives all four real decisions their own sentence, not just two", () => {
    // `PROVIDER_STATUS_TRANSITIONS` (`packages/shared`) reaches four targets
    // from `decide()`, not two — suspending and archiving are real admin
    // decisions too, and collapsing them back onto the generic "Reviewed"
    // fallback would leave the same ambiguity one status pair narrower.
    const t = i18n.getFixedT("en-US", "account");
    const name = "Barbearia do João";
    const byOutcome = ["active", "rejected", "suspended", "archived"].map((to) =>
      describeActivity(t, entry("provider.status.decided", { providerName: name, to })),
    );
    expect(new Set(byOutcome).size).toBe(byOutcome.length);
    expect(byOutcome).toEqual([
      "Approved Barbearia do João",
      "Rejected Barbearia do João",
      "Suspended Barbearia do João",
      "Archived Barbearia do João",
    ]);
  });

  it("pins the exact fr-FR strings, object-first participle like its siblings", () => {
    const fr = i18n.getFixedT("fr-FR", "account");
    const name = "Barbearia do João";
    expect(
      describeActivity(fr, entry("provider.status.decided", { providerName: name, to: "active" })),
    ).toBe("Barbearia do João approuvé");
    expect(
      describeActivity(fr, entry("provider.status.decided", { providerName: name, to: "rejected" })),
    ).toBe("Barbearia do João rejeté");
  });

  it("falls back to the base key for an outcome with no dedicated copy", () => {
    // `to` on a real row is always one of the four `decide()` targets, but
    // the render path must not throw or go blank if a future value (or a
    // legacy row) shows up without a matching `_<to>` key — i18next's own
    // context fallback (context key tried first, plain key second) is what
    // this relies on, not a branch in this codebase.
    const en = i18n.getFixedT("en-US", "account");
    expect(
      describeActivity(en, entry("provider.status.decided", { providerName: "X", to: "pending" })),
    ).toBe("Reviewed X");
    expect(
      describeActivity(en, entry("provider.status.decided", { providerName: "X" })),
    ).toBe("Reviewed X");
  });
});
