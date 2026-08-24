import type { EmailSuppressionRepositoryPort } from "../ports/outbound/email-suppression.repository.port";
import type { NotificationDeliveryRepositoryPort } from "../ports/outbound/notification-delivery.repository.port";

/**
 * The shape Resend actually sends, confirmed against its webhook docs
 * (resend.com/docs/webhooks/emails/bounced) rather than assumed:
 * `data.to` is an array, the bounce discriminator lives at `data.bounce.type`
 * with values `"Permanent"` / `"Transient"` / `"Undetermined"` (capitalized —
 * a different, lowercase `bounce_type` exists elsewhere in Resend's API, on
 * the broadcast-recipients endpoint, and is not this field), and the id that
 * correlates back to what we sent is `data.email_id` — the same value
 * `ResendEmailServiceAdapter.sendEmail` stores as `providerMessageId`
 * (Resend's send response returns it as `id`; `data.message_id` in the
 * webhook is an unrelated RFC 5322 `Message-ID` header value and will never
 * match a stored `providerMessageId`).
 */
export interface ResendWebhookEvent {
  type: string;
  data?: {
    email_id?: string;
    to?: string[];
    bounce?: { type?: string; [k: string]: unknown };
    [k: string]: unknown;
  };
}

/**
 * What a bounce or a complaint means for an address.
 *
 * **Only an explicit `"Permanent"` suppresses.** Resend also sends
 * `"Transient"` and `"Undetermined"`, and on an `email.bounced` event the
 * field can be absent entirely — none of those suppress. The asymmetry that
 * settles it is that there is no un-suppression path: a wrong suppression
 * loses a real recipient forever, while a missed suppression only costs
 * sender reputation, and reputation recovers. When Resend cannot say a bounce
 * is permanent, neither can we, so we don't act on it — but an absent or
 * unrecognized `bounce.type` is still `console.error`-ed by `reasonFor` so an
 * operator can see the bounce we deliberately did not act on; silence is how
 * a reputation problem hides.
 *
 * **An unknown event type is a no-op, not an error.** Providers add events
 * without asking, and a route that throws on one gets retried until the
 * provider gives up or the log fills.
 *
 * **This never writes a status onto the delivery row.** The row's `send`
 * genuinely happened — the provider accepted the message — so retroactively
 * marking it `failed` would be false, and `failed` is documented on the
 * aggregate as inviting a retry, which is the one thing a permanent bounce
 * must never get. A bounce is a fact about the *address*, not about that
 * send, and the suppression table is where facts about addresses already
 * live — that's the reason to put it there, not just that it's the cheaper
 * option.
 *
 * `deliveries.findByProviderMessageId` is used only to enrich *what gets
 * written to the suppression*, not to decide *whether* to suppress: it looks
 * up which notification this bounce was about and folds that into `detail`,
 * so an operator asking "what killed this address?" finds the answer next to
 * the bounce instead of doing a manual join. That lookup is best-effort —
 * finding nothing, or throwing, must never stop the suppression itself, which
 * is this command's one load-bearing effect.
 */
export class HandleResendWebhookInternalCommand {
  constructor(
    private readonly suppressions: EmailSuppressionRepositoryPort,
    private readonly deliveries: NotificationDeliveryRepositoryPort,
  ) {}

  async execute(event: ResendWebhookEvent): Promise<{ suppressed: boolean }> {
    const reason = reasonFor(event);
    if (!reason) return { suppressed: false };

    // `Array.isArray`, not `?? []`: Resend's docs say `data.to` is an array,
    // but nothing upstream of this command enforces that shape at runtime
    // (Task 9's signature check gates the request, not the field). A bare
    // string would still satisfy `?? []` and then `for...of` iterates it one
    // character at a time — one `suppress()` call per character, none of them
    // the real address, with no un-suppression path to undo the junk rows.
    // Treating a non-array as no recipients is the same "do nothing" this
    // command already does for other unexpected shapes.
    const to = event.data?.to;
    const recipients = Array.isArray(to) ? to : [];
    if (recipients.length === 0) return { suppressed: false };

    const detail = await this.enrichedDetail(event);
    for (const email of recipients) {
      await this.suppressions.suppress({ email, reason, detail });
    }
    return { suppressed: true };
  }

  /**
   * Folds "which notification this was" into the event body, best-effort.
   *
   * A lookup that finds no match (no `email_id` on the event, an id we never
   * recorded, a delivery that predates this correlation) or that throws
   * (a dropped connection is ordinary) falls back to the raw event data
   * rather than propagating — the suppression this enrichment rides along
   * with must land either way.
   */
  private async enrichedDetail(event: ResendWebhookEvent): Promise<unknown> {
    const providerMessageId = event.data?.email_id;
    if (!providerMessageId) return event.data ?? null;

    try {
      const delivery = await this.deliveries.findByProviderMessageId(providerMessageId);
      if (!delivery) return event.data ?? null;
      return {
        ...event.data,
        notification: { id: delivery.notificationId, type: delivery.type },
      };
    } catch (error) {
      // console.error, not the logger: getRequestScopedLogger() throws when
      // no scope is set, and nothing sets one for a webhook callback — same
      // reasoning as tx-context.ts's drainAfterCommit and
      // deliver-notification's own catches.
      console.error("[handle-resend-webhook] provider-message lookup failed", error);
      return event.data ?? null;
    }
  }
}

function reasonFor(event: ResendWebhookEvent): "bounce" | "complaint" | null {
  if (event.type === "email.complained") return "complaint";
  if (event.type !== "email.bounced") return null;

  const kind = event.data?.bounce?.type;
  if (kind === "Permanent") return "bounce";
  if (kind === "Transient" || kind === "Undetermined") return null;

  // Absent or unrecognized: do not suppress (see the class doc for why), but
  // never let it pass silently — that is how a reputation problem hides.
  // console.error, not the logger: getRequestScopedLogger() throws when no
  // scope is set, and nothing sets one for a webhook callback — same
  // reasoning as tx-context.ts's drainAfterCommit and deliver-notification's
  // own catches.
  console.error("[handle-resend-webhook] bounce with unrecognized bounce.type", {
    type: event.type,
    bounceType: kind,
  });
  return null;
}
