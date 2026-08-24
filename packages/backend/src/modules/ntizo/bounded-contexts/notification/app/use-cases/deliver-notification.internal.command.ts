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
 * its own delivery row and swallowed.
 *
 * **One notification can be several deliveries.** A workspace notification
 * becomes one per member, each rendered in that member's own language, each
 * with its own row — so a Portuguese owner's bounce does not silence a French
 * colleague.
 *
 * The order inside each delivery is deliberate: check suppression, then write
 * the row, then attempt. Writing after the attempt would leave an isolate that
 * died mid-send with no trace of an email that may well have gone out.
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
    const to =
      input.audience === "user"
        ? await this.oneOrNone(input.userId)
        : await this.recipients.forProviderMembers(input.providerId);

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
    // Rendered first, because a type with no template should cost nothing —
    // no row, no suppression lookup, no network. A type can reach an inbox
    // before anybody writes its email.
    const rendered = this.renderer.render(input.type, recipient.locale, input.payload);
    if (!rendered) return null;

    if (await this.suppressions.isSuppressed(recipient.email)) {
      // Recorded, not skipped. "We refused to write here" is a fact somebody
      // investigating a missing email needs to find.
      return this.deliveries.save(
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
      await this.deliveries.update(id, queued.markSent(messageId ?? ""));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.deliveries.update(id, queued.markFailed(message));
    }

    return id;
  }
}
