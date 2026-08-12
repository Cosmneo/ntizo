import { NotProviderMemberError } from "../../../catalog/domain/exceptions";
import type { ScheduleRepositoryPort } from "../ports/outbound/schedule.repository.port";

/**
 * A working draft of the shape Task 10 formalises as a zod read model
 * (`availabilityConfigReadModel`, in `packages/shared`). That schema also
 * carries `timezone` and each member's display `name` — fields this context's
 * ports don't source (timezone lives on the provider row; a name is a
 * profile concern). Task 10 enriches this query rather than reshaping it.
 */
export interface AvailabilityConfigDTO {
  providerId: string;
  members: {
    memberId: string;
    userId: string;
    role: string;
    weekly: { id: string; weekday: number; startMinute: number; endMinute: number }[];
    exceptions: {
      id: string;
      onDate: string;
      kind: "closed" | "custom";
      startMinute: number | null;
      endMinute: number | null;
      note: string | null;
    }[];
  }[];
  closures: { id: string; fromDate: string; toDate: string; note: string | null }[];
}

export class ReadAvailabilityConfigQuery {
  constructor(private readonly repo: ScheduleRepositoryPort) {}

  async execute(input: {
    requesterUserId: string;
    providerId: string;
    memberId?: string;
  }): Promise<AvailabilityConfigDTO> {
    if (!(await this.repo.isProviderMember(input.providerId, input.requesterUserId))) {
      throw new NotProviderMemberError();
    }

    // Scoped to this provider already — a `memberId` naming another
    // workspace simply matches nothing here, so there is no separate
    // membership check to run first, unlike the write-side commands.
    const allMembers = await this.repo.listMembers(input.providerId);
    const wanted = input.memberId
      ? allMembers.filter((m) => m.memberId === input.memberId)
      : allMembers;

    const members = await Promise.all(
      wanted.map(async (m) => {
        const schedule = await this.repo.findByMember(input.providerId, m.memberId);
        const json = schedule.toJSON();
        return {
          memberId: m.memberId,
          userId: m.userId,
          role: m.role,
          weekly: json.weekly,
          exceptions: json.exceptions,
        };
      }),
    );

    const closures = await this.repo.listClosures(input.providerId);

    return { providerId: input.providerId, members, closures };
  }
}
