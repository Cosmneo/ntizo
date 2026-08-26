import { describe, expect, it } from "vitest";
import i18n from "@/shared/lib/i18n";
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
