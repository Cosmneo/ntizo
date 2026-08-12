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
  bufferMinutes?: number;
  slotIntervalMinutes?: number;
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

    // Whoever creates a service is inserted into it (design spec, "Additions
    // to slice 1"). Without this every service is born with
    // `memberCount === 0`, and `canPublish` refuses to publish it — nobody
    // could ever finish onboarding a service through this command alone.
    const creatorMemberId = await this.repo.findMemberIdForUser(
      input.providerId,
      input.requesterUserId,
    );
    // `isProviderMember` above just confirmed this exact (providerId,
    // userId) pair, so a null here means the two queries disagree — a
    // broken invariant, not a condition a well-formed request can trigger.
    // A bare Error, not a domain exception (contrast NotProviderMemberError
    // etc.): the kit masks it to a generic INTERNAL_ERROR rather than giving
    // it a stable public code, which is correct here — there is no
    // legitimate client action this is ever meant to surface for.
    if (!creatorMemberId) {
      throw new Error(
        "[catalog] isProviderMember said yes but findMemberIdForUser found no row",
      );
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
      bufferMinutes: input.bufferMinutes,
      slotIntervalMinutes: input.slotIntervalMinutes,
    });
    service.setMembers([creatorMemberId]);

    await this.repo.save(service);
    return { serviceId: service.id };
  }
}
