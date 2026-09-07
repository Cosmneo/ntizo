import { and, eq, or } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { quote, quoteAttachment, type QuoteAttachmentRow } from "../../../../../shared/infrastructure/database/quote/schemas";
import { providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { NewQuoteAttachment, QuoteAttachmentRepositoryPort } from "../../../app/ports/outbound/quote-attachment.repository.port";

export class DrizzleQuoteAttachmentRepository implements QuoteAttachmentRepositoryPort {
  async insertMany(rows: NewQuoteAttachment[]): Promise<void> {
    if (rows.length === 0) return;
    await getDb().insert(quoteAttachment).values(rows);
  }

  async findVisible(attachmentId: string, viewerUserId: string): Promise<QuoteAttachmentRow | null> {
    const db = getDb();
    const [row] = await db
      .select({ attachment: quoteAttachment })
      .from(quoteAttachment)
      .innerJoin(quote, eq(quote.id, quoteAttachment.quoteId))
      .leftJoin(
        providerMember,
        and(eq(providerMember.providerId, quote.providerId), eq(providerMember.userId, viewerUserId)),
      )
      .where(
        and(
          eq(quoteAttachment.id, attachmentId),
          or(eq(quote.customerId, viewerUserId), eq(providerMember.userId, viewerUserId)),
        ),
      )
      .limit(1);
    return row?.attachment ?? null;
  }

  async findAny(attachmentId: string): Promise<QuoteAttachmentRow | null> {
    const [row] = await getDb().select().from(quoteAttachment).where(eq(quoteAttachment.id, attachmentId)).limit(1);
    return row ?? null;
  }
}
