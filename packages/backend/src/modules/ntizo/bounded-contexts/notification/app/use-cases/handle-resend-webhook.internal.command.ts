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
 * How many addresses one event may suppress.
 *
 * Resend caps a send at 50 recipients and this platform sends to exactly one,
 * so 50 is generous by a factor of fifty. The bound is not about plausible
 * events, though — it is about the one that is not. A signed 1 MiB body holds
 * roughly a hundred thousand addresses, each of which would take its own
 * sequential `await suppress()` on the request's `{ max: 1 }` connection, on a
 * command that is deliberately NOT deferred past the response. That is a
 * stalled Worker plus a hundred thousand rows on a table with no
 * un-suppression path.
 *
 * Reaching that needs the signing secret, so this is not a bypass and the
 * signature check is still the security boundary. What it changes is what a
 * leaked secret is worth: "suppress the addresses you can name" rather than
 * "take the Worker down and write damage nobody can undo".
 *
 * Over the cap, nothing is suppressed at all — not the first fifty. The same
 * asymmetry that governs `bounce.type` decides it: a wrong suppression loses a
 * real recipient forever, a missed one costs reputation and reputation
 * recovers. An event this shape is not one Resend sends, so acting on any part
 * of it is guessing, and the log line is what makes the refusal visible.
 */
const MAX_SUPPRESSIONS_PER_EVENT = 50;

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
 * **`data.to` is bounded and its elements are checked.** A signature proves
 * who sent a body, not that the body is sane, and this command is deliberately
 * not deferred past the response — so an event naming more addresses than a
 * send can have is refused whole (`MAX_SUPPRESSIONS_PER_EVENT`) and anything in
 * the list that is not a string is dropped before it can become a primary key.
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
    const listed: unknown[] = Array.isArray(to) ? to : [];
    if (listed.length === 0) return { suppressed: false };

    // The bound, before any per-element work. See MAX_SUPPRESSIONS_PER_EVENT:
    // nothing is suppressed when an event names more addresses than Resend
    // could ever have sent to, because acting on part of a body that shape is
    // guessing about writes that cannot be undone.
    if (listed.length > MAX_SUPPRESSIONS_PER_EVENT) {
      // console.error, not the logger — same reasoning as `reasonFor` below.
      console.error(
        "[handle-resend-webhook] refusing an event that names more recipients than a send can have",
        { type: event.type, recipients: listed.length, max: MAX_SUPPRESSIONS_PER_EVENT },
      );
      return { suppressed: false };
    }

    // Elements are checked, not assumed, for the same reason the array is.
    // `email` becomes the primary key of `email_suppression`, a `text` column:
    // a signed `to: [{}, 123]` would otherwise reach the insert as an object
    // or a number. Non-strings are dropped rather than failing the whole
    // event, so a real address listed beside junk is still suppressed — the
    // missable side of the asymmetry, not the unrecoverable one — and the
    // discards are logged so the shape drift is not silent.
    const recipients = listed.filter((x): x is string => typeof x === "string" && x !== "");
    if (recipients.length !== listed.length) {
      console.error("[handle-resend-webhook] ignored recipients that were not strings", {
        type: event.type,
        listed: listed.length,
        usable: recipients.length,
      });
    }
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
