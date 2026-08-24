import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { notificationDelivery } from "../../../../../shared/infrastructure/database/notification/schemas";
import type { NotificationType } from "@ntizo/shared";
import { NotificationDelivery } from "../../../domain/aggregates/notification-delivery.aggregate";
import type { NotificationDeliveryRepositoryPort } from "../../../app/ports/outbound/notification-delivery.repository.port";

export class DrizzleNotificationDeliveryRepository
  implements NotificationDeliveryRepositoryPort
{
  async save(entity: NotificationDelivery): Promise<string> {
    const [row] = await getDb()
      .insert(notificationDelivery)
      .values({
        notificationId: entity.notificationId,
        type: entity.type,
        channel: entity.channel,
        toEmail: entity.toEmail,
        locale: entity.locale,
        status: entity.status,
        providerMessageId: entity.providerMessageId,
        error: entity.error,
      })
      .returning({ id: notificationDelivery.id });
    return row!.id;
  }

  /**
   * `updatedAt` is set explicitly because a column default only fires on
   * insert. Without this a delivery that failed would keep advertising the
   * moment it was queued, and "what is stuck and for how long" is the question
   * this table exists to answer.
   */
  async update(id: string, entity: NotificationDelivery): Promise<void> {
    await getDb()
      .update(notificationDelivery)
      .set({
        status: entity.status,
        providerMessageId: entity.providerMessageId,
        error: entity.error,
        updatedAt: new Date(),
      })
      .where(eq(notificationDelivery.id, id));
  }

  /**
   * Newest first, because a provider can reuse an id across a resend and the
   * most recent attempt is the one a webhook is about.
   */
  async findByProviderMessageId(
    providerMessageId: string,
  ): Promise<NotificationDelivery | null> {
    const [row] = await getDb()
      .select()
      .from(notificationDelivery)
      .where(eq(notificationDelivery.providerMessageId, providerMessageId))
      .orderBy(desc(notificationDelivery.createdAt), desc(notificationDelivery.id))
      .limit(1);

    if (!row) return null;
    return NotificationDelivery.rehydrate({
      id: row.id,
      notificationId: row.notificationId,
      type: row.type as NotificationType,
      channel: "EMAIL",
      toEmail: row.toEmail,
      locale: row.locale,
      status: row.status as NotificationDelivery["status"],
      providerMessageId: row.providerMessageId,
      error: row.error,
    });
  }
}
