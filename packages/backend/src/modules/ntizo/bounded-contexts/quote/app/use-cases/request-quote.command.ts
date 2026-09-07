import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotificationType } from "@ntizo/shared";
import { hasContact } from "@ntizo/shared/text";
import { Quote, type QuoteAddress } from "../../domain/aggregates/quote.aggregate";
import { QuoteRequested } from "../../domain/events";
import { QuoteAddressRequiredError, QuoteContainsContactError, QuoteServiceNotQuotableError } from "../../domain/exceptions";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";
import type { QuoteRepositoryPort } from "../ports/outbound/quote.repository.port";
import type { QuoteAttachmentRepositoryPort } from "../ports/outbound/quote-attachment.repository.port";
import type { QuoteServiceReaderPort } from "../ports/outbound/quote-service.reader.port";
import type { StartThreadPort } from "../ports/outbound/start-thread.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import { raiseQuietly, type RaiseNotificationInternalPort } from "../ports/outbound/raise-notification.port";
import { resolveQuoteAttachments, type AttachmentDescriptor } from "./resolve-quote-attachments";

export interface RequestQuoteInput {
  /** From `requireUser` at the GraphQL layer, never from the client. */
  customerId: string;
  serviceId: string;
  description: string;
  /** `YYYY-MM-DD`. Advisory: the provider proposes whatever date they can. */
  neededBy?: string | null;
  address?: QuoteAddress | null;
  attachments?: AttachmentDescriptor[];
  /** The locale the customer was reading the page in; the service name is snapshotted in it later. */
  locale: string;
}

/** The provider's own promise when a service has no form row of its own. */
const DEFAULT_RESPONSE_HOURS = 48;

/**
 * The customer describes a job and one provider is asked to price it.
 *
 * **The thread is opened before the transaction, not inside it.** The
 * communication context's `startThread` is idempotent — it resolves as an
 * upsert on `thread_customer_provider_uq` — so a request that then fails to
 * write leaves at most an empty conversation, which is exactly what pressing
 * "Enviar mensagem" would have left. Holding it inside would mean this
 * transaction and communication's own writing to the same table through two
 * connections.
 *
 * **The address rule is the service's, not the form's alone.** A job that
 * happens at the customer's address needs one whatever the provider ticked,
 * because the booking that may follow cannot be created without it; a remote
 * or at-provider service is asked for one only when the form says so, and the
 * acceptance asks for it later if it is still missing.
 */
export class RequestQuoteCommand {
  constructor(
    private readonly repo: QuoteRepositoryPort,
    private readonly attachments: QuoteAttachmentRepositoryPort,
    private readonly services: QuoteServiceReaderPort,
    private readonly startThread: StartThreadPort,
    private readonly storage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
    private readonly raiseNotification: RaiseNotificationInternalPort,
  ) {}

  async execute(input: RequestQuoteInput): Promise<{ quoteId: string; respondBy: string }> {
    const at = new Date();

    const description = input.description.trim();
    if (hasContact(description)) throw new QuoteContainsContactError();

    const service = await this.services.findForQuote(input.serviceId, input.locale);
    if (!service) throw new QuoteServiceNotQuotableError("not_found");
    if (service.serviceStatus !== "published") throw new QuoteServiceNotQuotableError("not_published");
    if (service.bookingMode !== "quote") throw new QuoteServiceNotQuotableError("not_quote_mode");
    if (service.providerStatus !== "active") throw new QuoteServiceNotQuotableError("provider_not_active");

    const addressIsRequired =
      (service.quoteForm?.askLocation ?? true) ||
      service.locationType === "at_customer" ||
      service.locationType === "flexible";
    const address = input.address ?? null;
    if (addressIsRequired && address === null) throw new QuoteAddressRequiredError();

    const resolved = await resolveQuoteAttachments(this.storage, input.customerId, input.attachments ?? []);

    const { threadId } = await this.startThread.execute({
      customerUserId: input.customerId,
      providerId: service.providerId,
    });

    const responseHours = service.quoteForm?.responseHours ?? DEFAULT_RESPONSE_HOURS;
    const respondBy = new Date(at.getTime() + responseHours * 3_600_000);

    const quote = Quote.request({
      serviceId: service.serviceId,
      providerId: service.providerId,
      customerId: input.customerId,
      threadId,
      locale: input.locale,
      description,
      neededBy: input.neededBy ?? null,
      address,
      at,
      respondBy,
    });

    const saved = await this.unitOfWork.atomicExecute(async (): Promise<Quote> => {
      const inserted = await this.repo.insert(quote);
      const quoteId = inserted.id as string;

      await this.attachments.insertMany(
        resolved.map((file) => ({ quoteId, proposalId: null, step: "request" as const, ...file })),
      );

      await this.outboxPort.publish(
        [
          new QuoteRequested({
            quoteId,
            customerId: inserted.customerId,
            providerId: inserted.providerId,
            serviceId: inserted.serviceId,
            respondBy,
          }),
        ],
        "quote",
      );

      return inserted;
    });

    const quoteId = saved.id as string;

    await raiseQuietly(
      this.raiseNotification,
      {
        type: NotificationType.ProviderQuoteRequested,
        audience: "provider",
        providerId: saved.providerId,
        payload: {
          quoteId,
          serviceName: service.serviceName,
          respondBy: respondBy.toISOString(),
          neededBy: saved.neededBy,
        },
      },
      quoteId,
    );

    return { quoteId, respondBy: respondBy.toISOString() };
  }
}
