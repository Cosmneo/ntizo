import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { NotProviderOwnerOrAdminError, ServiceNotFoundError } from "../../domain/exceptions";
import type { ServiceRepositoryPort } from "../ports/outbound/service.repository.port";
import type { OutboxPort } from "../../../../shared/app/ports/outbox.port";

export class SetServiceStatusCommand {
  constructor(
    private readonly repo: ServiceRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(input: {
    requesterUserId: string;
    serviceId: string;
    status: "draft" | "published" | "archived";
  }): Promise<{ ok: true }> {
    const service = await this.repo.findById(input.serviceId);
    if (!service) throw new ServiceNotFoundError(input.serviceId);
    // Stricter than every other command in this bounded context: deciding
    // what the business sells and when it goes live is not the same act as
    // describing it, so this is the one place that asks for the role, not
    // just the membership.
    if (!(await this.repo.isProviderOwnerOrAdmin(service.providerId, input.requesterUserId))) {
      throw new NotProviderOwnerOrAdminError();
    }

    // Publishing is where the invariants are checked; the aggregate throws the
    // first thing standing in the way, with a code the form puts under a field.
    if (input.status === "published") service.publish(input.requesterUserId);
    else if (input.status === "draft") service.unpublish(input.requesterUserId);
    else service.archive();

    await this.unitOfWork.atomicExecute(async () => {
      await this.repo.save(service);
      await this.outboxPort.publish(service.pullEvents(), "service");
    });

    return { ok: true };
  }
}
