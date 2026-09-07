import type { QuoteAttachmentRow } from "../../../../../shared/infrastructure/database/quote/schemas";

export type QuoteAttachmentStep = "request" | "proposal" | "closing";

export interface NewQuoteAttachment {
  quoteId: string;
  proposalId: string | null;
  step: QuoteAttachmentStep;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface QuoteAttachmentRepositoryPort {
  insertMany(rows: NewQuoteAttachment[]): Promise<void>;
  /** The row, only if the viewer is the quote's customer or a member of its provider. */
  findVisible(attachmentId: string, viewerUserId: string): Promise<QuoteAttachmentRow | null>;
  /** For administrators. */
  findAny(attachmentId: string): Promise<QuoteAttachmentRow | null>;
}
