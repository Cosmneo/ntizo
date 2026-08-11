import { NotProviderMemberError, ServiceNotFoundError } from "../../domain/exceptions";
import type { ServiceRepositoryPort } from "../ports/outbound/service.repository.port";

export class SetServiceStatusCommand {
  constructor(private readonly repo: ServiceRepositoryPort) {}

  async execute(input: {
    requesterUserId: string;
    serviceId: string;
    status: "draft" | "published" | "archived";
  }): Promise<{ ok: true }> {
    const service = await this.repo.findById(input.serviceId);
    if (!service) throw new ServiceNotFoundError(input.serviceId);
    if (!(await this.repo.isProviderMember(service.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    // Publishing is where the invariants are checked; the aggregate throws the
    // first thing standing in the way, with a code the form puts under a field.
    if (input.status === "published") service.publish();
    else if (input.status === "draft") service.unpublish();
    else service.archive();

    await this.repo.save(service);
    return { ok: true };
  }
}
