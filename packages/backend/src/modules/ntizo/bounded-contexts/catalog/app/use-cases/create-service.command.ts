import { randomUUID } from "node:crypto";
import { Service } from "../../domain/aggregates/service.aggregate";
import { NotProviderMemberError } from "../../domain/exceptions";
import type { ServiceRepositoryPort } from "../ports/outbound/service.repository.port";

export interface CreateServiceInput {
  requesterUserId: string;
  providerId: string;
  categoryId: string;
  sourceLocale: string;
  locationType: string;
  bookingMode: "priced" | "quote";
  name: string;
  description?: string | null;
}

export class CreateServiceCommand {
  constructor(private readonly repo: ServiceRepositoryPort) {}

  async execute(input: CreateServiceInput): Promise<{ serviceId: string }> {
    // Membership, not ownership: an admin of the workspace may add services.
    // Checked here because it is a query and the kit's argsMapper is
    // synchronous — the GraphQL edge cannot ask this from a mapper.
    if (!(await this.repo.isProviderMember(input.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    const service = Service.create({
      id: randomUUID(),
      providerId: input.providerId,
      categoryId: input.categoryId,
      sourceLocale: input.sourceLocale,
      locationType: input.locationType,
      bookingMode: input.bookingMode,
      name: input.name.trim(),
      description: input.description?.trim() || null,
    });

    await this.repo.save(service);
    return { serviceId: service.id };
  }
}
