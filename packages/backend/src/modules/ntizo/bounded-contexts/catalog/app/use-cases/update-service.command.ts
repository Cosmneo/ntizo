import { NotProviderMemberError, ServiceNotFoundError } from "../../domain/exceptions";
import type { QuoteFormProps } from "../../domain/aggregates/service.aggregate";
import type { ServiceRepositoryPort } from "../ports/outbound/service.repository.port";

export interface UpdateServiceInput {
  requesterUserId: string;
  serviceId: string;
  categoryId?: string;
  locationType?: string;
  imageKeys?: string[];
  quoteForm?: QuoteFormProps;
}

export class UpdateServiceCommand {
  constructor(private readonly repo: ServiceRepositoryPort) {}

  async execute(input: UpdateServiceInput): Promise<{ ok: true }> {
    const service = await this.repo.findById(input.serviceId);
    if (!service) throw new ServiceNotFoundError(input.serviceId);
    if (!(await this.repo.isProviderMember(service.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    service.update({
      categoryId: input.categoryId,
      locationType: input.locationType,
      imageKeys: input.imageKeys,
    });
    // A separate call, not a field on `update`: the quote form only exists
    // for a quote service, and folding it into `update` would let a caller
    // set one on a priced service by accident. `setQuoteForm` itself now
    // refuses that (`QuoteFormNotAllowedError`) — this input type still
    // carries `quoteForm` regardless of `bookingMode`, so the guard has to
    // live in the aggregate, not just in how this command happens to be
    // called today.
    if (input.quoteForm) service.setQuoteForm(input.quoteForm);

    await this.repo.save(service);
    return { ok: true };
  }
}
