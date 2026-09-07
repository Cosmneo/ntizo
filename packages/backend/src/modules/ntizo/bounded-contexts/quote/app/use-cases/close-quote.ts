import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { hasContact } from "@ntizo/shared/text";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import type { Quote } from "../../domain/aggregates/quote.aggregate";
import { QuoteContainsContactError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteAttachmentRepositoryPort } from "../ports/outbound/quote-attachment.repository.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import { resolveQuoteAttachments, type AttachmentDescriptor } from "./resolve-quote-attachments";

/**
 * What the three closings share: a note the contact detector must pass, files
 * that ride with it, one compare-and-swap, and one event — everything except
 * *which* transition and *who* is told.
 *
 * A shared function rather than a base class: the three commands differ in
 * their authorisation, their transition and their notification, and a class
 * hierarchy would put those three differences behind three abstract methods
 * for no gain.
 */
export interface CloseQuoteDeps {
  repo: QuoteRepositoryPort;
  attachments: QuoteAttachmentRepositoryPort;
  storage: AttachmentStoragePort;
  unitOfWork: UnitOfWorkPort;
  outboxPort: OutboxPort;
}

export async function closeQuote(
  deps: CloseQuoteDeps,
  input: {
    quote: Quote;
    actorUserId: string;
    note: string | null | undefined;
    attachments: AttachmentDescriptor[] | undefined;
    transition: (quote: Quote, note: string | null) => Quote;
    event: (moved: Quote, quoteId: string) => BaseDomainEvent;
  },
): Promise<Quote | null> {
  const note = (input.note ?? "").trim();
  if (note.length > 0 && hasContact(note)) throw new QuoteContainsContactError();

  const resolved = await resolveQuoteAttachments(deps.storage, input.actorUserId, input.attachments ?? []);
  const moved = input.transition(input.quote, note.length === 0 ? null : note);
  const quoteId = input.quote.id as string;

  return await deps.unitOfWork.atomicExecute(async (): Promise<Quote | null> => {
    const persisted = await deps.repo.save(moved, input.quote.status);
    if (!persisted) return null;

    await deps.attachments.insertMany(
      resolved.map((file) => ({ quoteId, proposalId: null, step: "closing" as const, ...file })),
    );

    await deps.outboxPort.publish([input.event(persisted, quoteId)], "quote");
    return persisted;
  });
}
