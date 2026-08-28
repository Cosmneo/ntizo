import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { visibleToViewer } from "./thread-visibility";
import {
  attachment,
  message,
  thread,
  type AttachmentRow,
} from "../../../../../shared/infrastructure/database/communication/schemas";
import type {
  AttachmentRepositoryPort,
  NewAttachment,
} from "../../../app/ports/outbound/attachment.repository.port";

export class DrizzleAttachmentRepository implements AttachmentRepositoryPort {
  /**
   * No-op on an empty list rather than an `INSERT ... VALUES` with zero
   * rows, which postgres.js cannot express. `SendMessageCommand` already
   * only calls this when there is at least one attachment, but this stays
   * safe to call directly (from a test, say) with none.
   */
  async insertMany(messageId: string, attachments: NewAttachment[]): Promise<void> {
    if (attachments.length === 0) return;
    await getDb()
      .insert(attachment)
      .values(
        attachments.map((a) => ({
          messageId,
          storageKey: a.storageKey,
          fileName: a.fileName,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
        })),
      );
  }

  /** One query for the whole page — see the port doc comment for why a per-message loop is wrong. */
  async listForMessages(messageIds: string[]): Promise<Map<string, AttachmentRow[]>> {
    if (messageIds.length === 0) return new Map();

    const rows = await getDb().select().from(attachment).where(inArray(attachment.messageId, messageIds));

    const byMessage = new Map<string, AttachmentRow[]>();
    for (const row of rows) {
      const existing = byMessage.get(row.messageId);
      if (existing) existing.push(row);
      else byMessage.set(row.messageId, [row]);
    }
    return byMessage;
  }

  /**
   * Joins attachment → message → thread and applies the same visibility
   * rule `DrizzleThreadRepository.findVisible` applies — the customer on
   * the thread, or a `provider_member` row for `(thread.providerId,
   * viewerUserId)` — rather than the `fromTheOtherSide` shape
   * `message.repository.ts` uses for `markReadForViewer` /
   * `countUnreadForViewer`. That shape answers "is this row from the side
   * the viewer is *not* on", which is a different question from "may this
   * viewer see this row at all", and its second OR-branch is satisfied by
   * ANY viewer who is not the customer — including a stranger. Visibility
   * here is deliberately the closed pair `ThreadRepositoryPort.findVisible`
   * uses: customer, or a real member.
   */
  async findVisible(attachmentId: string, viewerUserId: string): Promise<AttachmentRow | null> {
    const [row] = await getDb()
      .select({
        id: attachment.id,
        messageId: attachment.messageId,
        storageKey: attachment.storageKey,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt,
      })
      .from(attachment)
      .innerJoin(message, eq(message.id, attachment.messageId))
      .innerJoin(thread, eq(thread.id, message.threadId))
      .where(
        and(
          eq(attachment.id, attachmentId),
          visibleToViewer(viewerUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}
