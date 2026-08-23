import { and, count, desc, eq, isNull, sql as raw } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  notification,
  notificationRead,
} from "../../../../../shared/infrastructure/database/notification/schemas";
import type { NotificationType } from "@ntizo/shared";
import { Notification } from "../../../domain/aggregates/notification.aggregate";
import type {
  InboxPage,
  InboxRow,
  NotificationRepositoryPort,
} from "../../../app/ports/outbound/notification.repository.port";

/**
 * Every read here resolves read state with a LEFT JOIN against
 * `notification_read` for ONE reader.
 *
 * The join is left, not inner, and this is the whole subtlety of the file: an
 * unread notification has no row on the right-hand side, so an inner join would
 * return exactly the items the reader has already seen — an inbox that empties
 * as you use it, and empty is the state nobody investigates.
 */
export class DrizzleNotificationRepository implements NotificationRepositoryPort {
  async save(entity: Notification): Promise<string> {
    const [row] = await getDb()
      .insert(notification)
      .values({
        type: entity.type,
        audience: entity.audience,
        userId: entity.userId,
        providerId: entity.providerId,
        payload: entity.payload,
      })
      .returning({ id: notification.id });
    return row!.id;
  }

  async listForUser(userId: string, limit: number, offset: number): Promise<InboxPage> {
    return this.list(eq(notification.userId, userId), userId, limit, offset);
  }

  async listForProvider(
    providerId: string,
    readerUserId: string,
    limit: number,
    offset: number,
  ): Promise<InboxPage> {
    return this.list(eq(notification.providerId, providerId), readerUserId, limit, offset);
  }

  private async list(
    scope: ReturnType<typeof eq>,
    readerUserId: string,
    limit: number,
    offset: number,
  ): Promise<InboxPage> {
    const db = getDb();

    const rows = await db
      .select({
        id: notification.id,
        type: notification.type,
        payload: notification.payload,
        createdAt: notification.createdAt,
        readAt: notificationRead.readAt,
      })
      .from(notification)
      .leftJoin(
        notificationRead,
        and(
          eq(notificationRead.notificationId, notification.id),
          eq(notificationRead.userId, readerUserId),
        ),
      )
      .where(scope)
      .orderBy(desc(notification.createdAt))
      .limit(limit)
      .offset(offset);

    // Counted separately rather than taken from `rows.length`: that is how many
    // fit on this page, and the results line means to state how many there are.
    const [{ value: total } = { value: 0 }] = await db
      .select({ value: count() })
      .from(notification)
      .where(scope);

    return {
      total,
      items: rows.map(
        (r): InboxRow => ({
          id: r.id,
          type: r.type,
          payload: r.payload as Record<string, unknown>,
          createdAt: r.createdAt.toISOString(),
          read: r.readAt !== null,
        }),
      ),
    };
  }

  async countUnreadForUser(userId: string): Promise<number> {
    return this.countUnread(eq(notification.userId, userId), userId);
  }

  async countUnreadForProvider(providerId: string, readerUserId: string): Promise<number> {
    return this.countUnread(eq(notification.providerId, providerId), readerUserId);
  }

  private async countUnread(
    scope: ReturnType<typeof eq>,
    readerUserId: string,
  ): Promise<number> {
    const [{ value } = { value: 0 }] = await getDb()
      .select({ value: count() })
      .from(notification)
      .leftJoin(
        notificationRead,
        and(
          eq(notificationRead.notificationId, notification.id),
          eq(notificationRead.userId, readerUserId),
        ),
      )
      .where(and(scope, isNull(notificationRead.notificationId)));
    return value;
  }

  /**
   * Marks read only if the item is actually addressed to this reader — either
   * personally, or through a workspace they belong to.
   *
   * The membership half is a subquery rather than a prior check in the command,
   * because a check followed by a write is a window in which membership can be
   * revoked. Returns false rather than throwing when nothing matched: whether
   * the id was wrong or the reader was not entitled is not a difference this
   * repository should let a caller measure.
   */
  async markRead(notificationId: string, readerUserId: string): Promise<boolean> {
    const result = await getDb().execute(raw`
      INSERT INTO ntizo_notification.notification_read (notification_id, user_id)
      SELECT n.id, ${readerUserId}
      FROM ntizo_notification.notification n
      WHERE n.id = ${notificationId}
        AND (
          n.user_id = ${readerUserId}
          OR EXISTS (
            SELECT 1 FROM ntizo_provider.provider_member pm
            WHERE pm.provider_id = n.provider_id AND pm.user_id = ${readerUserId}
          )
        )
      ON CONFLICT (notification_id, user_id) DO NOTHING
    `);

    if ((result.count ?? 0) > 0) return true;

    // Zero rows inserted means either "not entitled" or "already read". Only
    // the second is a success, so ask.
    const [existing] = await getDb()
      .select({ id: notificationRead.notificationId })
      .from(notificationRead)
      .where(
        and(
          eq(notificationRead.notificationId, notificationId),
          eq(notificationRead.userId, readerUserId),
        ),
      )
      .limit(1);
    return existing !== undefined;
  }

  async markAllReadForUser(userId: string): Promise<number> {
    const result = await getDb().execute(raw`
      INSERT INTO ntizo_notification.notification_read (notification_id, user_id)
      SELECT n.id, ${userId}
      FROM ntizo_notification.notification n
      WHERE n.user_id = ${userId}
      ON CONFLICT (notification_id, user_id) DO NOTHING
    `);
    return result.count ?? 0;
  }

  /**
   * Per-reader, always. One member catching up must not blank a colleague's
   * badge — which is exactly what a `read_at` column on `notification` would
   * have done, and the reason it is a separate table.
   */
  async markAllReadForProvider(providerId: string, readerUserId: string): Promise<number> {
    const result = await getDb().execute(raw`
      INSERT INTO ntizo_notification.notification_read (notification_id, user_id)
      SELECT n.id, ${readerUserId}
      FROM ntizo_notification.notification n
      WHERE n.provider_id = ${providerId}
        AND EXISTS (
          SELECT 1 FROM ntizo_provider.provider_member pm
          WHERE pm.provider_id = ${providerId} AND pm.user_id = ${readerUserId}
        )
      ON CONFLICT (notification_id, user_id) DO NOTHING
    `);
    return result.count ?? 0;
  }
}
