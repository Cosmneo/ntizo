import { describe, expect, it } from "vitest";
import i18n, { SUPPORTED_LOCALES } from "@/shared/lib/i18n";
import { describeActivity } from "../describe-activity";

/**
 * Closes the seam the final whole-branch review found: nothing connects a
 * handler's payload keys to the copy's `{{placeholder}}` names, and the
 * failure is not a blank — it is visible garbage.
 *
 * The reviewer proved it by renaming `{{email}}` -> `{{invitedEmail}}` in
 * `activityType.providerInviteSent` across all eight locales at once and
 * getting 753/753 green: `i18n-parity.test.ts` compares each locale's
 * placeholder set to English's, so a rename applied uniformly to every
 * locale stays in agreement with itself and the gate never notices. It does
 * not degrade to a blank either — i18next 23.16.8 defaults
 * `skipOnVariables: true`, and `shared/lib/i18n.ts` never overrides it, so a
 * key the payload does not carry survives verbatim in the rendered string,
 * e.g. `"Invited {{invitedEmail}}"`.
 *
 * The fix is this file: pin every one of the nine wire types against a
 * payload shaped exactly like what its own handler writes, so a rename on
 * one side without the other renders a leftover `{{...}}` token and this
 * test catches it directly, rather than by proxy through locale-to-locale
 * agreement. The shapes below are read from the handlers themselves, not
 * derived from the copy — deriving them from the copy would just have this
 * test agree with itself, which is the exact blind spot it exists to close.
 *
 *   user.registered            write/activity/events/handlers/user.event-handlers.ts:16-23    -> {}
 *   provider.created           .../provider.event-handlers.ts:57-66                             -> { providerName }
 *   provider.status.decided    .../provider.event-handlers.ts:68-77                              -> { providerName, to }
 *   provider.invite.sent       .../provider.event-handlers.ts:79-87                              -> { email }
 *   provider.invite.accepted   .../provider.event-handlers.ts:89-98                              -> { providerName }
 *   service.created            .../catalog.event-handlers.ts:56-65                               -> { serviceId, serviceName }
 *   service.published          .../catalog.event-handlers.ts:67-76                               -> { serviceId, serviceName }
 *   service.unpublished        .../catalog.event-handlers.ts:78-87                               -> { serviceId, serviceName }
 *   review.created             .../review.event-handlers.ts:20-32                                -> { providerName, rating }
 *
 * Only `serviceId` is not read by any template — kept in the payload here
 * anyway (as the handler writes it) so a template that started using it
 * would be exercised by the same assertion, not by a second fixture.
 */
const HANDLER_PAYLOADS: Record<string, Record<string, unknown>> = {
  "user.registered": {},
  "provider.created": { providerName: "Barbearia do João" },
  "provider.status.decided": { providerName: "Barbearia do João", to: "active" },
  "provider.invite.sent": { email: "joao@example.com" },
  "provider.invite.accepted": { providerName: "Barbearia do João" },
  "service.created": { serviceId: "svc-1", serviceName: "Corte de cabelo" },
  "service.published": { serviceId: "svc-1", serviceName: "Corte de cabelo" },
  "service.unpublished": { serviceId: "svc-1", serviceName: "Corte de cabelo" },
  "review.created": { providerName: "Barbearia do João", rating: 5 },
};

describe("activity copy renders every handler's real payload with no token left over", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const [type, payload] of Object.entries(HANDLER_PAYLOADS)) {
      it(`${locale}: ${type}`, () => {
        const t = i18n.getFixedT(locale, "account");
        const rendered = describeActivity(t, {
          id: "probe",
          type,
          payload,
          occurredAt: "2026-08-26T10:00:00Z",
        });
        // i18next's default `skipOnVariables` leaves a divergent placeholder
        // as a literal `{{...}}` token rather than blanking it — that is
        // what a payload/copy mismatch actually looks like in production,
        // so that is what this asserts against.
        expect(rendered, `${locale}/${type} rendered "${rendered}"`).not.toContain("{{");
      });
    }
  }
});
