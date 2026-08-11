import { NotProviderMemberError, ServiceNotFoundError } from "../../domain/exceptions";
import type { ServiceRepositoryPort } from "../ports/outbound/service.repository.port";

export interface SetServiceTranslationInput {
  requesterUserId: string;
  serviceId: string;
  locale: string;
  name: string;
  description: string | null;
  optionId?: string;
}

export class SetServiceTranslationCommand {
  constructor(private readonly repo: ServiceRepositoryPort) {}

  async execute(input: SetServiceTranslationInput): Promise<{ ok: true }> {
    const service = await this.repo.findById(input.serviceId);
    if (!service) throw new ServiceNotFoundError(input.serviceId);
    if (!(await this.repo.isProviderMember(service.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    // An option carries only a name in each locale — its price and duration
    // are not language-dependent — so `optionId` present means "this is the
    // option's name", not "this is the service's name with extra detail".
    if (input.optionId) {
      service.setOptionTranslation(input.optionId, input.locale, input.name);
    } else {
      service.setTranslation(input.locale, input.name, input.description);
    }

    await this.repo.save(service);
    return { ok: true };
  }
}
