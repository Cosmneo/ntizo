import { describe, expect, it } from "vitest";
import i18n, { SUPPORTED_LOCALES } from "@/shared/lib/i18n";

/**
 * Closes the same gap `activity-payload-interpolation.test.ts` closes for a
 * different namespace: `i18n-parity.test.ts` only ever proves every locale
 * keeps the *same set* of `{{placeholder}}` tokens as English — it has no
 * opinion on whether anything that actually calls `t()` supplies a payload
 * with a matching key. A rename on both sides of a call (template and
 * payload) at once stays in agreement with itself and slips straight past
 * that gate.
 *
 * Payloads below are shaped exactly like the two real call sites, not
 * derived from the copy itself — deriving them from the templates would
 * only have this test agree with itself, which is the exact blind spot it
 * exists to close:
 *
 *   unreadBadge   features/messaging/ui/thread-list.tsx     -> t("unreadBadge", { count })
 *   charCount     features/messaging/ui/message-composer.tsx -> t("charCount", { count, max })
 *
 * `unreadBadge` is exercised at both `count: 1` and `count: 3` — i18next's
 * pluralisation picks the base key or the `_other` suffix off `count`, and
 * `i18n-parity.test.ts`'s key-parity check already proves both variants
 * exist in every locale; this proves both actually resolve.
 */
const CALL_PAYLOADS: Record<string, Record<string, unknown>[]> = {
  unreadBadge: [{ count: 1 }, { count: 3 }],
  charCount: [
    { count: 0, max: 4000 },
    { count: 3987, max: 4000 },
  ],
};

describe("messaging copy renders every real call site's payload with no token left over", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const [key, payloads] of Object.entries(CALL_PAYLOADS)) {
      for (const payload of payloads) {
        it(`${locale}: ${key} with ${JSON.stringify(payload)}`, () => {
          const t = i18n.getFixedT(locale, "messaging");
          const rendered = t(key, payload);
          // i18next's default `skipOnVariables: true` leaves a divergent
          // placeholder as a literal `{{...}}` token rather than blanking
          // it — that is what a template/payload mismatch actually looks
          // like in production, so that is what this asserts against.
          expect(rendered, `${locale}/${key} rendered "${rendered}"`).not.toContain("{{");
        });
      }
    }
  }
});
