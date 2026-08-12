import { MemberNotInProviderError, NotSelfOrProviderOwnerOrAdminError } from "../../domain/exceptions";
import type { ScheduleRepositoryPort } from "../ports/outbound/schedule.repository.port";

export class ManageExceptionsCommand {
  constructor(private readonly repo: ScheduleRepositoryPort) {}

  /**
   * `memberBelongsToProvider` first, `isSelfOrProviderOwnerOrAdmin` second.
   * The guard answers a question about the *caller's* role, not about
   * `memberId` — an owner of workspace A reads as `true` for a member of
   * workspace B, because it is the owner's own row satisfying it. Checking
   * membership first keeps a foreign memberId from ever reaching that guard.
   */
  private async guard(providerId: string, requesterUserId: string, memberId: string): Promise<void> {
    if (!(await this.repo.memberBelongsToProvider(providerId, memberId))) {
      throw new MemberNotInProviderError(memberId);
    }
    if (!(await this.repo.isSelfOrProviderOwnerOrAdmin(providerId, requesterUserId, memberId))) {
      throw new NotSelfOrProviderOwnerOrAdminError();
    }
  }

  async add(input: {
    requesterUserId: string;
    providerId: string;
    memberId: string;
    onDate: string;
    kind: "closed" | "custom";
    startMinute: number | null;
    endMinute: number | null;
    note: string | null;
  }): Promise<{ exceptionId: string }> {
    await this.guard(input.providerId, input.requesterUserId, input.memberId);

    const schedule = await this.repo.findByMember(input.providerId, input.memberId);
    const exceptionId = schedule.addException({
      onDate: input.onDate,
      kind: input.kind,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      note: input.note,
    });
    await this.repo.save(schedule);
    return { exceptionId };
  }

  async remove(input: {
    requesterUserId: string;
    providerId: string;
    memberId: string;
    exceptionId: string;
  }): Promise<{ ok: true }> {
    await this.guard(input.providerId, input.requesterUserId, input.memberId);

    const schedule = await this.repo.findByMember(input.providerId, input.memberId);
    // Throws ExceptionNotFoundError before anything is written when the id
    // is not on this member's calendar.
    schedule.removeException(input.exceptionId);
    await this.repo.save(schedule);
    return { ok: true };
  }
}
