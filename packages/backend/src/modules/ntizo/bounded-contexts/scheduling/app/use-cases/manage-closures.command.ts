import {
  ClosureNotFoundError,
  ClosureRangeInvalidError,
  NotProviderOwnerOrAdminError,
} from "../../domain/exceptions";
import type { ScheduleRepositoryPort } from "../ports/outbound/schedule.repository.port";

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Closing the whole house is not something an aggregate holds — closures are
 * a flat range with no member of their own — so this command validates its
 * own dates instead of delegating to one, the same way `MemberSchedule`
 * validates minutes for a weekly rule.
 */
function assertRange(fromDate: string, toDate: string): void {
  if (!CIVIL_DATE.test(fromDate) || !CIVIL_DATE.test(toDate)) {
    throw new ClosureRangeInvalidError("dates must be written as YYYY-MM-DD");
  }
  if (toDate < fromDate) {
    throw new ClosureRangeInvalidError("it must end on or after it starts");
  }
}

export class ManageClosuresCommand {
  constructor(private readonly repo: ScheduleRepositoryPort) {}

  async add(input: {
    requesterUserId: string;
    providerId: string;
    fromDate: string;
    toDate: string;
    note: string | null;
  }): Promise<{ closureId: string }> {
    if (!(await this.repo.isProviderOwnerOrAdmin(input.providerId, input.requesterUserId))) {
      throw new NotProviderOwnerOrAdminError();
    }
    assertRange(input.fromDate, input.toDate);

    const closureId = await this.repo.addClosure({
      providerId: input.providerId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      note: input.note,
    });
    return { closureId };
  }

  async remove(input: {
    requesterUserId: string;
    providerId: string;
    closureId: string;
  }): Promise<{ ok: true }> {
    if (!(await this.repo.isProviderOwnerOrAdmin(input.providerId, input.requesterUserId))) {
      throw new NotProviderOwnerOrAdminError();
    }
    // `removeClosure` reports whether a row actually matched, so a closure
    // someone else already removed is refused rather than silently
    // confirmed — the click reads as "worked" either way otherwise.
    const deleted = await this.repo.removeClosure(input.providerId, input.closureId);
    if (!deleted) throw new ClosureNotFoundError(input.closureId);
    return { ok: true };
  }
}
