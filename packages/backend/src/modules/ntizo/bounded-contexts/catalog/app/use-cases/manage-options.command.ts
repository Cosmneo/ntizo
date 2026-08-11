import { randomUUID } from "node:crypto";
import { NotProviderMemberError, ServiceNotFoundError } from "../../domain/exceptions";
import type { Service } from "../../domain/aggregates/service.aggregate";
import type { ServiceRepositoryPort } from "../ports/outbound/service.repository.port";

interface Scoped { requesterUserId: string; serviceId: string; }

export class ManageOptionsCommand {
  constructor(private readonly repo: ServiceRepositoryPort) {}

  private async load(input: Scoped): Promise<Service> {
    const service = await this.repo.findById(input.serviceId);
    if (!service) throw new ServiceNotFoundError(input.serviceId);
    if (!(await this.repo.isProviderMember(service.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }
    return service;
  }

  async add(input: Scoped & {
    pricingMode: "fixed" | "hourly";
    amountMinor: number;
    currency: string;
    durationMinutes: number | null;
    minMinutes: number | null;
    stepMinutes: number | null;
    name: string;
  }): Promise<{ optionId: string }> {
    const service = await this.load(input);
    const optionId = randomUUID();
    service.addOption({ ...input, id: optionId });
    await this.repo.save(service);
    return { optionId };
  }

  async update(input: Scoped & {
    optionId: string;
    pricingMode?: "fixed" | "hourly";
    amountMinor?: number;
    currency?: string;
    durationMinutes?: number | null;
    minMinutes?: number | null;
    stepMinutes?: number | null;
    isDefault?: boolean;
    isActive?: boolean;
    name?: string;
  }): Promise<{ ok: true }> {
    const service = await this.load(input);
    // Destructured out, not used: `load` already consumed them, and this is
    // what is left over to hand the aggregate.
    const { requesterUserId: _requesterUserId, serviceId: _serviceId, optionId, ...rest } = input;
    service.updateOption(optionId, rest);
    await this.repo.save(service);
    return { ok: true };
  }

  async remove(input: Scoped & { optionId: string }): Promise<{ ok: true }> {
    const service = await this.load(input);
    service.removeOption(input.optionId);
    await this.repo.save(service);
    return { ok: true };
  }

  async reorder(input: Scoped & { orderedIds: string[] }): Promise<{ ok: true }> {
    const service = await this.load(input);
    service.reorderOptions(input.orderedIds);
    await this.repo.save(service);
    return { ok: true };
  }
}
