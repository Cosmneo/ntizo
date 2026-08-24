import type { NotificationType } from "@ntizo/shared";
import { NotificationDelivery } from "../../domain/aggregates/notification-delivery.aggregate";
import type { NotificationDeliveryRepositoryPort } from "../ports/outbound/notification-delivery.repository.port";
import type { EmailSuppressionRepositoryPort } from "../ports/outbound/email-suppression.repository.port";
import type { Recipient, RecipientReaderPort } from "../ports/outbound/recipient-reader.port";
import type { TemplateRendererPort } from "../ports/outbound/template-renderer.port";
import type { EmailServicePort } from "../../../../../../shared/infrastructure/email/email-service.port";

export type DeliverNotificationInput = {
  notificationId: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
} & (
  | { audience: "user"; userId: string }
  | { audience: "provider"; providerId: string }
);

/**
 * Turning a raised notification into email.
 *
 * **Never throws at its caller.** This runs after the inbox row is written and,
 * in production, after the response has gone. A provider approval must not
 * become a 500 because Resend was slow, and losing the inbox row because an
 * email failed would be the tail wagging the dog. Only one shape gets a
 * status written onto its row: a send that failed, recorded `failed`, when
 * that recording write itself succeeds. Every other failure is logged and
 * swallowed without changing the row's status — three different shapes of
 * "without", not one: no row exists yet to write to (the recipient lookup, or
 * `save` itself failing); a row exists and the email genuinely sent, but the
 * `update` recording that fails; or a row exists, the send failed, and the
 * `update` recording *that* also fails. The last two leave the row `queued`
 * on purpose — writing a status in that moment would either repeat a failure
 * that already didn't land, or assert something we can no longer confirm.
 *
 * **One notification can be several deliveries.** A workspace notification
 * becomes one per member, each rendered in that member's own language, each
 * with its own row, each wrapped in its own try — so a Portuguese owner's
 * bounce, or even a Portuguese owner's row failing to *write*, does not
 * silence a French colleague.
 *
 * The order inside each delivery is deliberate: render, then check
 * suppression, then write the row, then attempt. Rendering first means a
 * type with no template costs nothing. Writing before attempting means an
 * isolate that died mid-send with no trace of an email that may well have
 * gone out.
 */
export class DeliverNotificationInternalCommand {
  constructor(
    private readonly deliveries: NotificationDeliveryRepositoryPort,
    private readonly suppressions: EmailSuppressionRepositoryPort,
    private readonly recipients: RecipientReaderPort,
    private readonly renderer: TemplateRendererPort,
    private readonly sender: EmailServicePort,
  ) {}

  async execute(input: DeliverNotificationInput): Promise<{ deliveryIds: string[] }> {
    let to: Recipient[];
    try {
      to =
        input.audience === "user"
          ? await this.oneOrNone(input.userId)
          : await this.recipients.forProviderMembers(input.providerId);
    } catch (error) {
      // Same "never throws at its caller" reasoning as deliverOne's catch
      // below: with no recipients resolved there is nobody to deliver to and
      // nothing to record, and that must not turn a provider's action into a
      // 500. See the console.error note in deliverOne for why it's not the
      // request logger.
      console.error("[deliver-notification] recipient lookup failed", error);
      return { deliveryIds: [] };
    }

    const ids: string[] = [];
    for (const recipient of to) {
      const id = await this.deliverOne(input, recipient);
      if (id) ids.push(id);
    }
    return { deliveryIds: ids };
  }

  private async oneOrNone(userId: string): Promise<Recipient[]> {
    const r = await this.recipients.forUser(userId);
    return r ? [r] : [];
  }

  private async deliverOne(
    input: DeliverNotificationInput,
    recipient: Recipient,
  ): Promise<string | null> {
    try {
      // Rendered first, because a type with no template should cost nothing —
      // no row, no suppression lookup, no network. A type can reach an inbox
      // before anybody writes its email.
      const rendered = this.renderer.render(input.type, recipient.locale, input.payload);
      if (!rendered) return null;

      if (await this.suppressions.isSuppressed(recipient.email)) {
        // Recorded, not skipped. "We refused to write here" is a fact somebody
        // investigating a missing email needs to find. The `await` here is
        // load-bearing: without it, a rejection from `save` would return as
        // a rejected promise rather than throw inside this try, and escape
        // uncaught instead of being caught below.
        return await this.deliveries.save(
          NotificationDelivery.suppressed({
            notificationId: input.notificationId,
            type: input.type,
            toEmail: recipient.email,
            locale: recipient.locale,
          }),
        );
      }

      const queued = NotificationDelivery.queue({
        notificationId: input.notificationId,
        type: input.type,
        toEmail: recipient.email,
        locale: recipient.locale,
      });
      const id = await this.deliveries.save(queued);

      let sent: { messageId: string | null };
      try {
        sent = await this.sender.sendEmail({
          to: [recipient.email],
          subject: rendered.subject,
          htmlBody: rendered.html,
          textBody: rendered.text,
        });
      } catch (error) {
        // Not a certainty that nothing went out — a timeout can fire after
        // the provider has already accepted the message, the same kind of
        // unknowability the post-send case below exists to be honest about.
        // But there is no messageId here to correlate a later "did this
        // already send" against, so there is nothing safer to do with the
        // uncertainty than record `failed` and let it invite the retry the
        // aggregate's own doc says a `failed` delivery should invite. An
        // occasional duplicate email is the cheaper mistake of the two.
        const message = error instanceof Error ? error.message : String(error);
        await this.deliveries.update(id, queued.markFailed(message));
        return id;
      }

      // The email is already out — a failure from here on is not a failure
      // to send. If this update itself throws (a connection dropping between
      // the send and the write is ordinary), marking the row `failed` would
      // be a false record, and a worse one than a missing update: `failed`
      // means "this did not send" and would invite somebody to resend an
      // email its recipient already has. Left `queued`, the row says the one
      // honest thing available — "we do not know what became of this" — and
      // the outer catch below logs the update's own error.
      //
      // The id is also passed through unmodified, null included. A null id
      // is a real fact — "this provider sent it but didn't hand back a
      // reference" — not a missing value to paper over with "".
      // `notification_delivery_message_idx` is a partial index on
      // `provider_message_id IS NOT NULL`; storing "" would put every such
      // delivery in it under the same key and make
      // findByProviderMessageId("") return "whichever is newest" instead of
      // "not found".
      await this.deliveries.update(id, queued.markSent(sent.messageId));

      return id;
    } catch (error) {
      // Everything above this line can throw for reasons that have nothing
      // to do with this recipient's email being deliverable: a dropped
      // connection, a query timeout. That includes every await in this
      // method — the render, the suppression check, the `queue`/`suppressed`
      // factory calls, `save` itself, the send-failure path's own `update`
      // (markFailed, when even recording the failure fails), and the
      // post-send success `update` (markSent). One recipient's
      // infrastructure failure must not cost every other recipient in the
      // loop their delivery, so it's caught here rather than only around the
      // send. When it's either `update` that throws, this id never makes it
      // into `deliveryIds` even though a row exists — for the post-send case
      // the email genuinely went out — and logging here is all there is for
      // both.
      //
      // Honest limit: when `deliveries.save` itself is what throws, there is
      // no row to record the failure on — the row *is* the recording
      // mechanism. Logging is all that's left.
      //
      // console.error, not the logger: getRequestScopedLogger() throws when
      // no scope is set, and nothing in this repo sets one for fire-and-forget
      // delivery work — tx-context.ts's drainAfterCommit swallows after-commit
      // callback failures the same way for the same reason.
      console.error("[deliver-notification] delivery to a recipient failed", error);
      return null;
    }
  }
}
