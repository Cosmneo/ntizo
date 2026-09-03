import { describe, expect, it } from "vitest";
import i18n, { SUPPORTED_LOCALES } from "@/shared/lib/i18n";

/**
 * Closes the same gap `activity-payload-interpolation.test.ts` closes for a
 * different namespace: `i18n-parity.test.ts` only ever proves every locale
 * keeps the *same set* of `{{placeholder}}` tokens as English — it has no
 * opinion on whether the payload the backend actually raises a type with
 * carries a key matching the template. The `notifications` namespace had no
 * guard for that at all before this file: `messaging-payload-interpolation.test.ts`
 * exists, but it is scoped to the `messaging` namespace's own keys
 * (`unreadBadge`, `charCount`, …), not to notification types — see that
 * file's own doc comment.
 *
 * `notification-cell.tsx:60` calls `t(\`type.${key}\`, { replace:
 * notification.payload })` — this exercises exactly that call, `replace`
 * option included, since i18next reserves `count`/`context`/`lng`/`ns`/
 * `defaultValue` when a payload is spread into the options object directly.
 *
 * Payloads below are shaped exactly like what the backend's own handlers
 * write, not derived from the copy itself — deriving them from the templates
 * would only have this test agree with itself, which is the exact blind spot
 * it exists to close:
 *
 *   NEW_MESSAGE                notify-unread.internal.command.ts:104                    -> { threadId }
 *   SUPPORT_REQUEST_OPENED     open-support-request.command.ts:131                       -> { threadId, subject, requestAudience, providerId? }
 *   SUPPORT_REQUEST_MESSAGE    notify-unread.internal.command.ts:109-113 (raised at 130-133) -> { threadId, subject, requestAudience, providerId? }
 *   SUPPORT_REPLY              notify-unread.internal.command.ts:109-113 (raised at 117-119) -> { threadId, subject, requestAudience, providerId? }
 *   SUPPORT_REQUEST_RESOLVED   resolve-support-request.command.ts:34-38                  -> { threadId, subject, requestAudience, providerId? }
 *
 * `providerId` is only ever present on a provider-audience request, so it is
 * exercised on one of the four support keys below and left out of the
 * others — the same asymmetry the real payloads have. `NEW_MESSAGE`'s
 * payload carries no `subject` at all, which is exactly why its copy
 * (`newMessage`) must not reference `{{subject}}` — a rename that added one
 * would render a literal `{{subject}}` token, and this proves it does not.
 */
const NOTIFICATION_PAYLOADS: Record<string, Record<string, unknown>> = {
  newMessage: { threadId: "thread-1" },
  supportRequestOpened: {
    threadId: "thread-1",
    subject: "Não consigo pagar a reserva",
    requestAudience: "customer",
  },
  supportRequestMessage: {
    threadId: "thread-1",
    subject: "Não consigo pagar a reserva",
    requestAudience: "provider",
    providerId: "provider-1",
  },
  supportReply: {
    threadId: "thread-1",
    subject: "Não consigo pagar a reserva",
    requestAudience: "customer",
  },
  supportRequestResolved: {
    threadId: "thread-1",
    subject: "Não consigo pagar a reserva",
    requestAudience: "customer",
  },
};

describe("notification copy renders every backend payload with no token left over", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const [key, payload] of Object.entries(NOTIFICATION_PAYLOADS)) {
      it(`${locale}: type.${key}`, () => {
        const t = i18n.getFixedT(locale, "notifications");
        const rendered = t(`type.${key}`, { replace: payload });
        // i18next's default `skipOnVariables: true` leaves a divergent
        // placeholder as a literal `{{...}}` token rather than blanking it —
        // that is what a template/payload mismatch actually looks like in
        // production, so that is what this asserts against.
        expect(rendered, `${locale}/type.${key} rendered "${rendered}"`).not.toContain("{{");
      });
    }
  }
});
