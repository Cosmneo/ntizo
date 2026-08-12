import { describe, expect, test } from "bun:test";
import { ListServiceAvailability } from "../app/use-cases/list-service-availability.projection";
import { MemberSchedule } from "../../../bounded-contexts/scheduling/domain/aggregates/member-schedule.aggregate";
import type { ScheduleRepositoryPort } from "../../../bounded-contexts/scheduling/app/ports/outbound/schedule.repository.port";
import type { BusyIntervalsPort } from "../../../bounded-contexts/scheduling/app/ports/outbound/busy-intervals.port";

const PROVIDER = "11111111-1111-1111-1111-111111111111";
const JOAO = "22222222-2222-2222-2222-222222222222";
const MARIA = "33333333-3333-3333-3333-333333333333";
const SERVICE = "44444444-4444-4444-4444-444444444444";

/** Monday to Friday, 08:00-18:00. 2026-08-12 is a Wednesday. */
function workingWeek(memberId: string) {
  const s = MemberSchedule.create(PROVIDER, memberId);
  s.setWeeklyPattern(
    [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 480, endMinute: 1080 })),
  );
  return s;
}

type SchedulingInfo = Awaited<ReturnType<ScheduleRepositoryPort["findServiceSchedulingInfo"]>>;

function fakeRepo(
  overrides: Partial<{
    schedules: Map<string, MemberSchedule>;
    closures: { id: string; fromDate: string; toDate: string; note: string | null }[];
    info: SchedulingInfo;
  }> = {},
) {
  const schedules = overrides.schedules ?? new Map([[JOAO, workingWeek(JOAO)]]);
  const closures = overrides.closures ?? [];
  const info =
    overrides.info === undefined
      ? {
          serviceId: SERVICE,
          providerId: PROVIDER,
          timezone: "Africa/Maputo",
          bufferMinutes: 0,
          slotIntervalMinutes: 30,
          bookingMode: "priced" as const,
          status: "published",
          memberIds: [JOAO],
          defaultOption: {
            pricingMode: "fixed" as const,
            durationMinutes: 45,
            minMinutes: null,
            stepMinutes: null,
          },
        }
      : overrides.info;

  return {
    findServiceSchedulingInfo: async () => info,
    findByMember: async (_p: string, memberId: string) =>
      schedules.get(memberId) ?? MemberSchedule.create(PROVIDER, memberId),
    listClosures: async () => closures,
    // The projection touches nothing else; leaving the rest unimplemented
    // means a projection that starts calling them fails loudly here rather
    // than silently reading undefined.
  } as unknown as ScheduleRepositoryPort;
}

function fakeBusy(rows: Map<string, { date: string; start: number; end: number }[]> = new Map()) {
  const port = {
    calls: 0,
    async forMembers() {
      port.calls += 1;
      return rows;
    },
  };
  return port;
}

/**
 * Wraps a repository, counting every call, without changing what it answers.
 *
 * The point of the projection's shape is that the number of round trips is a
 * function of how many *members* perform the service, never of how many days
 * were asked for. A wrapper is the only way to assert that: the fake itself
 * answers instantly, so a per-day loop would be invisible in the timings and
 * perfectly correct in the output.
 */
function countingRepo(inner: ScheduleRepositoryPort) {
  const calls = { findServiceSchedulingInfo: 0, findByMember: 0, listClosures: 0 };
  const repo = {
    async findServiceSchedulingInfo(serviceId: string) {
      calls.findServiceSchedulingInfo += 1;
      return inner.findServiceSchedulingInfo(serviceId);
    },
    async findByMember(providerId: string, memberId: string) {
      calls.findByMember += 1;
      return inner.findByMember(providerId, memberId);
    },
    async listClosures(providerId: string) {
      calls.listClosures += 1;
      return inner.listClosures(providerId);
    },
  } as unknown as ScheduleRepositoryPort;
  return { repo, calls };
}

function makeProjection(
  repoOverrides: Parameters<typeof fakeRepo>[0] = {},
  busy: ReturnType<typeof fakeBusy> = fakeBusy(),
) {
  return new ListServiceAvailability(fakeRepo(repoOverrides), busy as unknown as BusyIntervalsPort);
}

/**
 * Runs `fn`, expecting it to throw, and returns the thrown error's `.code`.
 *
 * The kit carries `code` beside `message` on every error type these use cases
 * throw. Reading it directly is what "assert on the code" means, as opposed to
 * matching the message with `toThrow(/CODE/)` — which breaks the moment
 * somebody rewords a sentence for a reader who was never going to see the code.
 */
async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e && typeof e === "object" && "code" in e) return String((e as { code: unknown }).code);
    throw e;
  }
  throw new Error("expected to throw");
}

/** The default fixture's service, in a single-day window on a Wednesday. */
const ONE_WEDNESDAY = { serviceId: SERVICE, memberId: undefined, from: "2026-08-12", to: "2026-08-12" };

const HOURLY_INFO: NonNullable<SchedulingInfo> = {
  serviceId: SERVICE,
  providerId: PROVIDER,
  timezone: "Africa/Maputo",
  bufferMinutes: 0,
  slotIntervalMinutes: 30,
  bookingMode: "priced",
  status: "published",
  memberIds: [JOAO],
  defaultOption: {
    pricingMode: "hourly",
    durationMinutes: null,
    minMinutes: 60,
    stepMinutes: 30,
  },
};

describe("ListServiceAvailability", () => {
  test("a fixed service returns the grid for each open day", async () => {
    const projection = makeProjection();
    const result = await projection.execute(ONE_WEDNESDAY);

    expect(result.serviceId).toBe(SERVICE);
    expect(result.timezone).toBe("Africa/Maputo");
    expect(result.pricingMode).toBe("fixed");
    expect(result.days).toHaveLength(1);
    expect(result.days[0]!.date).toBe("2026-08-12");
    // 08:00 to the last start that finishes by 18:00, on the 30-minute grid.
    expect(result.days[0]!.starts[0]!.minuteOfDay).toBe(480);
    expect(result.days[0]!.starts.at(-1)!.minuteOfDay).toBe(1020); // 17:00, ends 17:45
    // 480, 510, … 1020 inclusive.
    expect(result.days[0]!.starts).toHaveLength(19);
    // Fixed services have one knowable length, so nothing is left to choose.
    expect(result.days[0]!.starts[0]!.maxMinutes).toBeNull();
    expect(result.days[0]!.starts[0]!.memberIds).toEqual([JOAO]);
  });

  test("a day covered by a house closure comes back with no starts", async () => {
    const projection = makeProjection({
      closures: [
        { id: "c-1", fromDate: "2026-08-10", toDate: "2026-08-14", note: "Annual shutdown" },
      ],
    });
    const result = await projection.execute(ONE_WEDNESDAY);

    // The day is still in the list. A screen has to draw a closed Wednesday,
    // and a client that infers it from a missing key will infer it wrongly.
    expect(result.days).toHaveLength(1);
    expect(result.days[0]!.date).toBe("2026-08-12");
    expect(result.days[0]!.starts).toEqual([]);
  });

  test("a house closure that ends before the day leaves it open", async () => {
    // The closure comparison is a range test, not an equality test; a closure
    // that stops on the 11th must not silently swallow the 12th.
    const projection = makeProjection({
      closures: [{ id: "c-1", fromDate: "2026-08-10", toDate: "2026-08-11", note: null }],
    });
    const result = await projection.execute(ONE_WEDNESDAY);

    expect(result.days[0]!.starts.length).toBeGreaterThan(0);
  });

  test("a member's closed exception removes only that member", async () => {
    // Two performers, one closed that day: the day still has starts, all of
    // them naming only the other member.
    const joao = workingWeek(JOAO);
    joao.addException({
      onDate: "2026-08-12",
      kind: "closed",
      startMinute: null,
      endMinute: null,
      note: "Sick",
    });
    const projection = makeProjection({
      schedules: new Map([
        [JOAO, joao],
        [MARIA, workingWeek(MARIA)],
      ]),
      info: { ...baseInfo(), memberIds: [JOAO, MARIA] },
    });
    const result = await projection.execute(ONE_WEDNESDAY);

    expect(result.days[0]!.starts.length).toBeGreaterThan(0);
    for (const start of result.days[0]!.starts) {
      expect(start.memberIds).toEqual([MARIA]);
    }
  });

  test("a start free for two members carries both ids", async () => {
    const projection = makeProjection({
      schedules: new Map([
        [JOAO, workingWeek(JOAO)],
        [MARIA, workingWeek(MARIA)],
      ]),
      info: { ...baseInfo(), memberIds: [JOAO, MARIA] },
    });
    const result = await projection.execute(ONE_WEDNESDAY);

    expect(result.days[0]!.starts).toHaveLength(19);
    for (const start of result.days[0]!.starts) {
      expect(start.memberIds).toEqual([JOAO, MARIA]);
    }
  });

  test("busy time supplied by the port is subtracted", async () => {
    // Nothing supplies it until slice 4; the fake does, which is what proves
    // the projection actually passes it through to the engine.
    const busy = fakeBusy(
      new Map([[JOAO, [{ date: "2026-08-12", start: 480, end: 600 }]]]), // 08:00-10:00 taken
    );
    const result = await makeProjection({}, busy).execute(ONE_WEDNESDAY);

    const minutes = result.days[0]!.starts.map((s) => s.minuteOfDay);
    expect(minutes).not.toContain(480);
    expect(minutes).not.toContain(540);
    expect(minutes[0]).toBe(600);
    expect(minutes.at(-1)).toBe(1020);
  });

  test("busy time on another date leaves this one alone", async () => {
    // The busy rows arrive for the whole window in one map; picking the wrong
    // date out of it would blank a day nobody has booked.
    const busy = fakeBusy(
      new Map([[JOAO, [{ date: "2026-08-13", start: 480, end: 1080 }]]]),
    );
    const result = await makeProjection({}, busy).execute(ONE_WEDNESDAY);

    expect(result.days[0]!.starts[0]!.minuteOfDay).toBe(480);
  });

  test("an hourly service reports the longest length per start", async () => {
    const projection = makeProjection({ info: HOURLY_INFO });
    const result = await projection.execute(ONE_WEDNESDAY);

    expect(result.pricingMode).toBe("hourly");
    // 08:00 with the whole day ahead of it: 600 minutes, on the 30-minute step.
    expect(result.days[0]!.starts[0]).toMatchObject({ minuteOfDay: 480, maxMinutes: 600 });
    // 17:00, with exactly the 60-minute minimum left before 18:00.
    expect(result.days[0]!.starts.at(-1)).toMatchObject({ minuteOfDay: 1020, maxMinutes: 60 });
  });

  test("hourly maxMinutes is the largest among the free members", async () => {
    // Maria works only the morning that day, so from 08:00 she can carry 240
    // minutes and João 600. The start must advertise 600 — the longest
    // somebody can actually do — not Maria's shorter answer.
    const maria = workingWeek(MARIA);
    maria.addException({
      onDate: "2026-08-12",
      kind: "custom",
      startMinute: 480,
      endMinute: 720,
      note: null,
    });
    const projection = makeProjection({
      schedules: new Map([
        [JOAO, workingWeek(JOAO)],
        [MARIA, maria],
      ]),
      info: { ...HOURLY_INFO, memberIds: [JOAO, MARIA] },
    });
    const result = await projection.execute(ONE_WEDNESDAY);

    const at = (minute: number) => result.days[0]!.starts.find((s) => s.minuteOfDay === minute);
    expect(at(480)).toMatchObject({ maxMinutes: 600, memberIds: [JOAO, MARIA] });
    // 11:00 — Maria can still fit her 60-minute minimum before noon, João 420.
    expect(at(660)).toMatchObject({ maxMinutes: 420, memberIds: [JOAO, MARIA] });
    // 12:00 — Maria's morning is over, so only João remains and only his
    // length is on offer.
    expect(at(720)).toMatchObject({ maxMinutes: 360, memberIds: [JOAO] });
  });

  test("a quote service returns an empty day list, not an error", async () => {
    const projection = makeProjection({
      info: { ...baseInfo(), bookingMode: "quote", defaultOption: null },
    });
    const result = await projection.execute(ONE_WEDNESDAY);

    expect(result.days).toEqual([]);
    // Still a real answer about a real service, not a stub.
    expect(result.serviceId).toBe(SERVICE);
    expect(result.timezone).toBe("Africa/Maputo");
  });

  test("a window wider than 62 days is refused", async () => {
    const projection = makeProjection();
    expect(
      await codeOf(() =>
        projection.execute({
          serviceId: SERVICE,
          memberId: undefined,
          from: "2026-01-01",
          to: "2026-04-01",
        }),
      ),
    ).toBe("AVAILABILITY_WINDOW_TOO_WIDE");
  });

  test("exactly 62 days is accepted", async () => {
    const projection = makeProjection();
    const result = await projection.execute({
      serviceId: SERVICE,
      memberId: undefined,
      from: "2026-01-01",
      to: "2026-03-03",
    });

    expect(result.days).toHaveLength(62);
    expect(result.days[0]!.date).toBe("2026-01-01");
    expect(result.days.at(-1)!.date).toBe("2026-03-03");
  });

  test("a named member who does not perform the service is refused", async () => {
    const projection = makeProjection();
    expect(
      await codeOf(() => projection.execute({ ...ONE_WEDNESDAY, memberId: MARIA })),
    ).toBe("SERVICE_MEMBER_CANNOT_PERFORM");
  });

  test("a named member who does perform it narrows the answer to them", async () => {
    const projection = makeProjection({
      schedules: new Map([
        [JOAO, workingWeek(JOAO)],
        [MARIA, workingWeek(MARIA)],
      ]),
      info: { ...baseInfo(), memberIds: [JOAO, MARIA] },
    });
    const result = await projection.execute({ ...ONE_WEDNESDAY, memberId: MARIA });

    expect(result.days[0]!.starts.length).toBeGreaterThan(0);
    for (const start of result.days[0]!.starts) {
      expect(start.memberIds).toEqual([MARIA]);
    }
  });

  test("an unpublished service is not found", async () => {
    const projection = makeProjection({ info: { ...baseInfo(), status: "draft" } });
    expect(await codeOf(() => projection.execute(ONE_WEDNESDAY))).toBe("SERVICE_NOT_FOUND");
  });

  test("a service that does not exist is not found", async () => {
    const projection = makeProjection({ info: null });
    expect(await codeOf(() => projection.execute(ONE_WEDNESDAY))).toBe("SERVICE_NOT_FOUND");
  });

  test("startsAt is the instant matching the provider's timezone", async () => {
    // Maputo, 09:00 local on 2026-08-12 → "2026-08-12T07:00:00.000Z".
    const projection = makeProjection();
    const result = await projection.execute(ONE_WEDNESDAY);

    const nine = result.days[0]!.starts.find((s) => s.minuteOfDay === 540);
    expect(nine).toBeDefined();
    expect(nine!.startsAt).toBe("2026-08-12T07:00:00.000Z");
  });

  test("the busy port is asked once, not once per day", async () => {
    const busyFake = fakeBusy();
    const projection = makeProjection({}, busyFake);
    await projection.execute({
      serviceId: SERVICE,
      memberId: undefined,
      from: "2026-08-01",
      to: "2026-08-31",
    });

    expect(busyFake.calls).toBe(1);
  });

  test("a 62-day window costs one call per member plus three, whatever its length", async () => {
    // 1 × findServiceSchedulingInfo + 1 × listClosures + 1 × busy.forMembers,
    // plus one findByMember per performer. A per-day loop would multiply the
    // last three by 62 and still produce exactly the same output.
    const busyFake = fakeBusy();
    const { repo, calls } = countingRepo(
      fakeRepo({
        schedules: new Map([
          [JOAO, workingWeek(JOAO)],
          [MARIA, workingWeek(MARIA)],
        ]),
        info: { ...baseInfo(), memberIds: [JOAO, MARIA] },
      }),
    );
    const projection = new ListServiceAvailability(repo, busyFake as unknown as BusyIntervalsPort);

    const result = await projection.execute({
      serviceId: SERVICE,
      memberId: undefined,
      from: "2026-01-01",
      to: "2026-03-03",
    });

    expect(result.days).toHaveLength(62);
    expect(calls.findServiceSchedulingInfo).toBe(1);
    expect(calls.listClosures).toBe(1);
    expect(calls.findByMember).toBe(2);
    expect(busyFake.calls).toBe(1);
  });

  test("a weekend inside the window comes back present and empty", async () => {
    // Saturday the 15th and Sunday the 16th are outside the Monday-to-Friday
    // pattern; they are days with nothing on them, not absent days.
    const projection = makeProjection();
    const result = await projection.execute({
      serviceId: SERVICE,
      memberId: undefined,
      from: "2026-08-14",
      to: "2026-08-17",
    });

    expect(result.days.map((d) => d.date)).toEqual([
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
    ]);
    expect(result.days[1]!.starts).toEqual([]); // Saturday
    expect(result.days[2]!.starts).toEqual([]); // Sunday
    expect(result.days[0]!.starts.length).toBeGreaterThan(0); // Friday
    expect(result.days[3]!.starts.length).toBeGreaterThan(0); // Monday
  });

  test("the service's buffer keeps the last appointment inside the working day", async () => {
    // 45 minutes of work plus 30 of cleanup must both finish by 18:00, so the
    // last start moves back from 17:00 to 16:30.
    const projection = makeProjection({ info: { ...baseInfo(), bufferMinutes: 30 } });
    const result = await projection.execute(ONE_WEDNESDAY);

    expect(result.days[0]!.starts.at(-1)!.minuteOfDay).toBe(990);
  });
});

/** The fixture's default info, as a fresh object each call so a spread cannot leak between tests. */
function baseInfo(): NonNullable<SchedulingInfo> {
  return {
    serviceId: SERVICE,
    providerId: PROVIDER,
    timezone: "Africa/Maputo",
    bufferMinutes: 0,
    slotIntervalMinutes: 30,
    bookingMode: "priced",
    status: "published",
    memberIds: [JOAO],
    defaultOption: {
      pricingMode: "fixed",
      durationMinutes: 45,
      minMinutes: null,
      stepMinutes: null,
    },
  };
}
