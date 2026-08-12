import { MemberNotInProviderError, NotSelfOrProviderOwnerOrAdminError } from "../../domain/exceptions";
import type { ScheduleRepositoryPort } from "../ports/outbound/schedule.repository.port";

export class SetWeeklyPatternCommand {
  constructor(private readonly repo: ScheduleRepositoryPort) {}

  async execute(input: {
    requesterUserId: string;
    providerId: string;
    memberId: string;
    rules: { weekday: number; startMinute: number; endMinute: number }[];
  }): Promise<{ ok: true }> {
    // `memberBelongsToProvider` first, `isSelfOrProviderOwnerOrAdmin` second —
    // never the other way round. The guard reads the *caller's* provider_member
    // row: an owner of workspace A satisfies it for ANY targetMemberId, because
    // it is the caller's own role answering, not a check that the target sits
    // in the same workspace. If memberId came from another provider and this
    // ran first, an owner of A would edit a member of B's hours. Checking
    // membership first makes that impossible before the guard is ever asked.
    if (!(await this.repo.memberBelongsToProvider(input.providerId, input.memberId))) {
      throw new MemberNotInProviderError(input.memberId);
    }
    if (
      !(await this.repo.isSelfOrProviderOwnerOrAdmin(
        input.providerId,
        input.requesterUserId,
        input.memberId,
      ))
    ) {
      throw new NotSelfOrProviderOwnerOrAdminError();
    }

    const schedule = await this.repo.findByMember(input.providerId, input.memberId);
    // Throws AvailabilityRuleInvalidError before touching `schedule`'s props
    // when a rule is malformed — nothing reaches `save` in that case.
    schedule.setWeeklyPattern(input.rules);
    await this.repo.save(schedule);
    return { ok: true };
  }
}
