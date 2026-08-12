import type { AvailabilityConfigDTO } from "@ntizo/shared/read-models";
import { NotProviderMemberError } from "../../../catalog/domain/exceptions";
import type { ScheduleRepositoryPort } from "../ports/outbound/schedule.repository.port";

export type { AvailabilityConfigDTO };

/**
 * The provider's own availability configuration: every member's week and
 * exceptions, the workspace's closures, and its timezone, in one response.
 *
 * Takes only `providerId`, deliberately — an earlier draft of this query
 * also accepted an optional `memberId` to narrow the member list to one, but
 * nothing ever called it: the GraphQL field this query backs
 * (`availability.config`) exposes only `providerId`, because the screen's
 * person picker needs every member to draw itself, and fetching each
 * member's week on selection would turn switching people into a network
 * round trip for data measured in dozens of rows. A parameter no caller can
 * reach and no guard protects is worse than either committing to it or
 * dropping it, so it was dropped here rather than left unreachable.
 */
export class ReadAvailabilityConfigQuery {
  constructor(private readonly repo: ScheduleRepositoryPort) {}

  async execute(input: {
    requesterUserId: string;
    providerId: string;
  }): Promise<AvailabilityConfigDTO> {
    if (!(await this.repo.isProviderMember(input.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    const [allMembers, timezone, closures] = await Promise.all([
      this.repo.listMembers(input.providerId),
      this.repo.findProviderTimezone(input.providerId),
      this.repo.listClosures(input.providerId),
    ]);

    const members = await Promise.all(
      allMembers.map(async (m) => {
        const schedule = await this.repo.findByMember(input.providerId, m.memberId);
        const json = schedule.toJSON();
        return {
          memberId: m.memberId,
          userId: m.userId,
          name: m.name,
          role: m.role,
          weekly: json.weekly,
          exceptions: json.exceptions,
        };
      }),
    );

    return { providerId: input.providerId, timezone, members, closures };
  }
}
