import { NotProviderMemberError, ServiceNeedsMemberError, ServiceNotFoundError } from "../../domain/exceptions";
// Already exists in the scheduling bounded context, which asks the same
// question ("does this member id belong to this provider?") for the same
// reason — imported rather than declared a second time here.
import { MemberNotInProviderError } from "../../../scheduling/domain/exceptions";
import type { ServiceRepositoryPort } from "../ports/outbound/service.repository.port";

export interface SetServiceMembersInput {
  requesterUserId: string;
  serviceId: string;
  memberIds: string[];
}

export class SetServiceMembersCommand {
  constructor(private readonly repo: ServiceRepositoryPort) {}

  async execute(input: SetServiceMembersInput): Promise<{ ok: true }> {
    const service = await this.repo.findById(input.serviceId);
    if (!service) throw new ServiceNotFoundError(input.serviceId);

    // Any member, not just an owner or admin — describing who does the work
    // is the work, the same split `ManageOptionsCommand` and
    // `UpdateServiceCommand` already draw.
    if (!(await this.repo.isProviderMember(service.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    const uniqueIds = [...new Set(input.memberIds)];
    for (const memberId of uniqueIds) {
      if (!(await this.repo.memberBelongsToProvider(service.providerId, memberId))) {
        throw new MemberNotInProviderError(memberId);
      }
    }

    // The one refusal that lives here rather than in the aggregate: clearing
    // the last performer of a service already on the marketplace is an edit,
    // and whoever is making it can simply not make it. A member leaving the
    // workspace is the other way a service can end up with nobody — that
    // path is not refusable, and it unpublishes instead (see the provider
    // bounded context's `RemoveProviderMemberCommand` and the catalog's
    // `unpublishServicesWithoutMembers`).
    if (service.status === "published" && uniqueIds.length === 0) {
      throw new ServiceNeedsMemberError();
    }

    service.setMembers(uniqueIds);
    await this.repo.save(service);
    return { ok: true };
  }
}
