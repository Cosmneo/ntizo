import { beforeEach, describe, expect, test } from "bun:test";
import { MemberSchedule } from "../domain/aggregates/member-schedule.aggregate";
import { SetWeeklyPatternCommand } from "../app/use-cases/set-weekly-pattern.command";
import { ManageExceptionsCommand } from "../app/use-cases/manage-exceptions.command";
import { ManageClosuresCommand } from "../app/use-cases/manage-closures.command";
import { ReadAvailabilityConfigQuery } from "../app/use-cases/read-availability-config.query";
import type { ClosureRow, ScheduleRepositoryPort } from "../app/ports/outbound/schedule.repository.port";

/** The kit carries `code` beside `message` — asserting on the message matches nothing. */
async function codeOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

interface MemberRow {
  providerId: string;
  memberId: string;
  userId: string;
  role: "owner" | "admin" | "staff";
}

interface ClosureStoreRow extends ClosureRow {
  providerId: string;
}

/**
 * In-memory double for `ScheduleRepositoryPort`.
 *
 * "prov-1" has three members: `user-1` owns it, `user-2` is staff, `user-3`
 * is an admin — the same three-role split `catalog`'s FakeRepo uses. "prov-2"
 * has one member of its own (`mem-9`), which exists solely so a test can pass
 * a `memberId` that is real but belongs to the wrong workspace.
 *
 * `isSelfOrProviderOwnerOrAdmin` mirrors the Drizzle adapter exactly: it
 * reads only the CALLER's own row (by providerId + userId) and never checks
 * that `targetMemberId` belongs to `providerId`. That is deliberate — see
 * the port's doc comment — and is what makes the "member id from another
 * workspace" test meaningful: without the commands' own
 * `memberBelongsToProvider` check running first, an owner of prov-1 would
 * read as authorised for a member of prov-2, because it is the owner's own
 * role satisfying the guard, not a fact about the target member.
 */
class FakeScheduleRepo implements ScheduleRepositoryPort {
  saved = false;
  private schedules = new Map<string, MemberSchedule>();
  private closures: ClosureStoreRow[] = [];
  private closureSeq = 0;
  private readonly members: MemberRow[] = [
    { providerId: "prov-1", memberId: "mem-1", userId: "user-1", role: "owner" },
    { providerId: "prov-1", memberId: "mem-2", userId: "user-2", role: "staff" },
    { providerId: "prov-1", memberId: "mem-3", userId: "user-3", role: "admin" },
    { providerId: "prov-2", memberId: "mem-9", userId: "user-9", role: "owner" },
  ];

  private key(providerId: string, memberId: string): string {
    return `${providerId}:${memberId}`;
  }

  async findByMember(providerId: string, memberId: string): Promise<MemberSchedule> {
    return this.schedules.get(this.key(providerId, memberId)) ?? MemberSchedule.create(providerId, memberId);
  }

  async save(schedule: MemberSchedule): Promise<void> {
    this.saved = true;
    this.schedules.set(this.key(schedule.providerId, schedule.memberId), schedule);
  }

  async listClosures(providerId: string): Promise<ClosureRow[]> {
    return this.closures
      .filter((c) => c.providerId === providerId)
      .map((c) => ({ id: c.id, fromDate: c.fromDate, toDate: c.toDate, note: c.note }));
  }

  async addClosure(input: {
    providerId: string;
    fromDate: string;
    toDate: string;
    note: string | null;
  }): Promise<string> {
    const id = `closure-${++this.closureSeq}`;
    this.closures.push({ id, ...input });
    return id;
  }

  async removeClosure(providerId: string, closureId: string): Promise<void> {
    this.closures = this.closures.filter((c) => !(c.id === closureId && c.providerId === providerId));
  }

  async listMembers(providerId: string): Promise<{ memberId: string; userId: string; role: string }[]> {
    return this.members
      .filter((m) => m.providerId === providerId)
      .map((m) => ({ memberId: m.memberId, userId: m.userId, role: m.role }));
  }

  async memberBelongsToProvider(providerId: string, memberId: string): Promise<boolean> {
    return this.members.some((m) => m.providerId === providerId && m.memberId === memberId);
  }

  async isProviderMember(providerId: string, userId: string): Promise<boolean> {
    return this.members.some((m) => m.providerId === providerId && m.userId === userId);
  }

  async isProviderOwnerOrAdmin(providerId: string, userId: string): Promise<boolean> {
    const m = this.members.find((x) => x.providerId === providerId && x.userId === userId);
    return m?.role === "owner" || m?.role === "admin";
  }

  async isSelfOrProviderOwnerOrAdmin(
    providerId: string,
    userId: string,
    targetMemberId: string,
  ): Promise<boolean> {
    const m = this.members.find((x) => x.providerId === providerId && x.userId === userId);
    if (!m) return false;
    return m.memberId === targetMemberId || m.role === "owner" || m.role === "admin";
  }

  async findServiceSchedulingInfo(): ReturnType<ScheduleRepositoryPort["findServiceSchedulingInfo"]> {
    return null;
  }
}

let repo: FakeScheduleRepo;
beforeEach(() => {
  repo = new FakeScheduleRepo();
});

describe("SetWeeklyPatternCommand", () => {
  test("a member setting their own hours succeeds", async () => {
    const out = await new SetWeeklyPatternCommand(repo).execute({
      requesterUserId: "user-2",
      providerId: "prov-1",
      memberId: "mem-2",
      rules: [{ weekday: 1, startMinute: 480, endMinute: 720 }],
    });
    expect(out).toEqual({ ok: true });
    expect(repo.saved).toBe(true);
    const schedule = await repo.findByMember("prov-1", "mem-2");
    expect(schedule.weekly).toHaveLength(1);
    expect(schedule.weekly[0]!.weekday).toBe(1);
  });

  test("an owner setting another member's hours succeeds", async () => {
    const out = await new SetWeeklyPatternCommand(repo).execute({
      requesterUserId: "user-1",
      providerId: "prov-1",
      memberId: "mem-2",
      rules: [{ weekday: 2, startMinute: 600, endMinute: 660 }],
    });
    expect(out).toEqual({ ok: true });
    const schedule = await repo.findByMember("prov-1", "mem-2");
    expect(schedule.weekly).toHaveLength(1);
    expect(schedule.weekly[0]!.weekday).toBe(2);
  });

  test("a staff member setting another member's hours is refused", async () => {
    const cmd = new SetWeeklyPatternCommand(repo);
    expect(
      await codeOf(() =>
        cmd.execute({
          requesterUserId: "user-2",
          providerId: "prov-1",
          memberId: "mem-3",
          rules: [{ weekday: 1, startMinute: 480, endMinute: 720 }],
        }),
      ),
    ).toBe("NOT_SELF_OR_PROVIDER_OWNER_OR_ADMIN");
  });

  test("a member id from another workspace is refused before the guard runs", async () => {
    const cmd = new SetWeeklyPatternCommand(repo);
    // user-1 owns prov-1, and mem-9 is a real member — of prov-2. If the
    // membership check did not run first, isSelfOrProviderOwnerOrAdmin would
    // read `true` for user-1 (their own row says "owner") and the write
    // would go through against a workspace user-1 has no part in.
    expect(
      await codeOf(() =>
        cmd.execute({
          requesterUserId: "user-1",
          providerId: "prov-1",
          memberId: "mem-9",
          rules: [{ weekday: 1, startMinute: 480, endMinute: 720 }],
        }),
      ),
    ).toBe("MEMBER_NOT_IN_PROVIDER");
    expect(repo.saved).toBe(false);
  });

  test("an invalid rule is refused and nothing is saved", async () => {
    const cmd = new SetWeeklyPatternCommand(repo);
    expect(
      await codeOf(() =>
        cmd.execute({
          requesterUserId: "user-1",
          providerId: "prov-1",
          memberId: "mem-1",
          rules: [{ weekday: 1, startMinute: 800, endMinute: 800 }],
        }),
      ),
    ).toBe("AVAILABILITY_RULE_INVALID");
    expect(repo.saved).toBe(false);
  });
});

describe("ManageExceptionsCommand", () => {
  test("adding a closed day returns its id", async () => {
    const out = await new ManageExceptionsCommand(repo).add({
      requesterUserId: "user-1",
      providerId: "prov-1",
      memberId: "mem-2",
      onDate: "2026-12-25",
      kind: "closed",
      startMinute: null,
      endMinute: null,
      note: null,
    });
    expect(out.exceptionId).toBeTruthy();
    const schedule = await repo.findByMember("prov-1", "mem-2");
    expect(schedule.exceptions).toHaveLength(1);
    expect(schedule.exceptions[0]!.id).toBe(out.exceptionId);
    expect(schedule.exceptions[0]!.kind).toBe("closed");
  });

  test("a staff member adding an exception to another member's calendar is refused", async () => {
    const cmd = new ManageExceptionsCommand(repo);
    expect(
      await codeOf(() =>
        cmd.add({
          requesterUserId: "user-2",
          providerId: "prov-1",
          memberId: "mem-3",
          onDate: "2026-12-25",
          kind: "closed",
          startMinute: null,
          endMinute: null,
          note: null,
        }),
      ),
    ).toBe("NOT_SELF_OR_PROVIDER_OWNER_OR_ADMIN");
  });

  test("removing an exception that is not there is refused", async () => {
    const cmd = new ManageExceptionsCommand(repo);
    expect(
      await codeOf(() =>
        cmd.remove({
          requesterUserId: "user-1",
          providerId: "prov-1",
          memberId: "mem-1",
          exceptionId: "00000000-0000-0000-0000-000000000000",
        }),
      ),
    ).toBe("EXCEPTION_NOT_FOUND");
  });
});

describe("ManageClosuresCommand", () => {
  test("an owner adds a closure", async () => {
    const out = await new ManageClosuresCommand(repo).add({
      requesterUserId: "user-1",
      providerId: "prov-1",
      fromDate: "2026-12-24",
      toDate: "2026-12-26",
      note: "Christmas",
    });
    expect(out.closureId).toBeTruthy();
    const closures = await repo.listClosures("prov-1");
    expect(closures.some((c) => c.id === out.closureId)).toBe(true);
  });

  test("an admin adds a closure", async () => {
    const out = await new ManageClosuresCommand(repo).add({
      requesterUserId: "user-3",
      providerId: "prov-1",
      fromDate: "2026-12-31",
      toDate: "2027-01-01",
      note: null,
    });
    expect(out.closureId).toBeTruthy();
    const closures = await repo.listClosures("prov-1");
    expect(closures.some((c) => c.id === out.closureId)).toBe(true);
  });

  test("a staff member adding a closure is refused", async () => {
    const cmd = new ManageClosuresCommand(repo);
    expect(
      await codeOf(() =>
        cmd.add({
          requesterUserId: "user-2",
          providerId: "prov-1",
          fromDate: "2026-12-24",
          toDate: "2026-12-26",
          note: null,
        }),
      ),
    ).toBe("NOT_PROVIDER_OWNER_OR_ADMIN");
  });

  test("a staff member removing a closure is refused", async () => {
    const { closureId } = await new ManageClosuresCommand(repo).add({
      requesterUserId: "user-1",
      providerId: "prov-1",
      fromDate: "2026-12-24",
      toDate: "2026-12-26",
      note: null,
    });
    const cmd = new ManageClosuresCommand(repo);
    expect(
      await codeOf(() =>
        cmd.remove({ requesterUserId: "user-2", providerId: "prov-1", closureId }),
      ),
    ).toBe("NOT_PROVIDER_OWNER_OR_ADMIN");
    // Never got to the mutation: the closure is still there.
    const closures = await repo.listClosures("prov-1");
    expect(closures.some((c) => c.id === closureId)).toBe(true);
  });

  test("a range ending before it starts is refused", async () => {
    const cmd = new ManageClosuresCommand(repo);
    expect(
      await codeOf(() =>
        cmd.add({
          requesterUserId: "user-1",
          providerId: "prov-1",
          fromDate: "2026-12-26",
          toDate: "2026-12-24",
          note: null,
        }),
      ),
    ).toBe("CLOSURE_RANGE_INVALID");
  });

  test("a date that is not a civil date is refused", async () => {
    const cmd = new ManageClosuresCommand(repo);
    expect(
      await codeOf(() =>
        cmd.add({
          requesterUserId: "user-1",
          providerId: "prov-1",
          fromDate: "26-12-2026",
          toDate: "2026-12-27",
          note: null,
        }),
      ),
    ).toBe("CLOSURE_RANGE_INVALID");
  });
});

describe("ReadAvailabilityConfigQuery", () => {
  test("a staff member may read the workspace's configuration", async () => {
    const result = await new ReadAvailabilityConfigQuery(repo).execute({
      requesterUserId: "user-2",
      providerId: "prov-1",
    });
    expect(result.providerId).toBe("prov-1");
    expect(result.members.map((m) => m.memberId).sort()).toEqual(["mem-1", "mem-2", "mem-3"]);
  });

  test("someone who is not a member is refused", async () => {
    const query = new ReadAvailabilityConfigQuery(repo);
    expect(
      await codeOf(() => query.execute({ requesterUserId: "stranger", providerId: "prov-1" })),
    ).toBe("NOT_PROVIDER_MEMBER");
  });
});
