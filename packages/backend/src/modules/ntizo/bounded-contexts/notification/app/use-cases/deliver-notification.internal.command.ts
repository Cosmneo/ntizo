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
 * email failed would be the tail wagging the dog. Every failure is recorded on
 * its own delivery row and swallowed. Where there is no row yet to record
 * against — the recipient lookup, or a `save` that never completes — there is
 * nothing to write, so the failure is logged instead and swallowed there too.
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
        // investigating a missing email needs to find.
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

      try {
        const { messageId } = await this.sender.sendEmail({
          to: [recipient.email],
          subject: rendered.subject,
          htmlBody: rendered.html,
          textBody: rendered.text,
        });
        // Passed through unmodified, null included. A null id is a real fact
        // — "this provider sent it but didn't hand back a reference" — not a
        // missing value to paper over with "". `notification_delivery_message_idx`
        // is a partial index on `provider_message_id IS NOT NULL`; storing ""
        // would put every such delivery in it under the same key and make
        // findByProviderMessageId("") return "whichever is newest" instead of
        // "not found".
        await this.deliveries.update(id, queued.markSent(messageId));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.deliveries.update(id, queued.markFailed(message));
      }

      return id;
    } catch (error) {
      // Everything above this line — the render, the suppression check,
      // `save` itself — can throw for reasons that have nothing to do with
      // this recipient's email being deliverable: a dropped connection, a
      // query timeout. One recipient's infrastructure failure must not cost
      // every other recipient in the loop their delivery, so it's caught
      // here rather than only around the send.
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
