import { describe, expect, it } from "bun:test";
import type {
  BookingListRow,
  BookingReadRepositoryPort,
  ProviderBookingRow,
  ProviderListFilter,
  ProviderMemberOption,
  ProviderStats,
  ProviderTimelineRow,
} from "../app/ports/outbound/booking-read.repository.port";
import { ListProviderBookingsProjection } from "../app/use-cases/list-provider-bookings.projection";
import { GetProviderBookingProjection } from "../app/use-cases/get-provider-booking.projection";
import { GetProviderStatsProjection, fillDays } from "../app/use-cases/get-provider-stats.projection";
import { toProviderBookingDetailDTO } from "../app/use-cases/to-provider-booking-dto";

const NOW = new Date("2026-09-04T10:00:00.000Z");

/** A workspace with no bookings at all — `FakeRepo`'s default `stats`. */
const ZERO_STATS: ProviderStats = {
  totals: {
    awaitingResponse: 0,
    awaitingPayment: 0,
    upcomingToday: 0,
    upcomingWeek: 0,
    completedLast30: 0,
    declinedLast30: 0,
    revenueLast30Minor: 0,
    pipelineMinor: 0,
    currency: null,
    today: "2026-09-04",
  },
  perDay: [],
};

const STATS: ProviderStats = {
  totals: {
    awaitingResponse: 3,
    awaitingPayment: 1,
    upcomingToday: 2,
    upcomingWeek: 5,
    completedLast30: 9,
    declinedLast30: 1,
    revenueLast30Minor: 1_240_000,
    pipelineMinor: 630_000,
    currency: "MZN",
    today: "2026-09-03",
  },
  perDay: [
    { date: "2026-09-01", requests: 2, confirmed: 1 },
    { date: "2026-09-03", requests: 4, confirmed: 3 },
  ],
};

function row(over: Partial<ProviderBookingRow> = {}): ProviderBookingRow {
  return {
    id: "bk-1",
    status: "AWAITING_PROVIDER",
    createdAt: new Date("2026-09-04T09:00:00.000Z"),
    customerId: "cust-1",
    serviceId: "svc-1",
    serviceOptionId: "opt-1",
    serviceName: "Corte de cabelo",
    optionName: "Padrão",
    durationMinutes: 45,
    locationType: "at_customer",
    providerMemberId: "mem-1",
    memberFirstName: "Célia",
    customerFirstName: "Ana",
    customerPhone: "+258840000001",
    customerEmail: "ana@example.com",
    startsAt: new Date("2026-09-05T09:00:00.000Z"),
    endsAt: new Date("2026-09-05T09:45:00.000Z"),
    timezone: "Africa/Maputo",
    addressLabel: "Casa",
    addressLine: "Av. Julius Nyerere 1234",
    addressCity: "Maputo",
    addressDistrict: "Polana",
    addressDirections: "Portão azul",
    description: "Cabelo curto",
    paymentRef: null,
    priceMinor: 80000,
    commissionBps: 1000,
    commissionMinor: 8000,
    currency: "MZN",
    expiresAt: new Date("2026-09-04T11:00:00.000Z"),
    ...over,
  };
}

class FakeRepo implements BookingReadRepositoryPort {
  public calls: string[] = [];
  public stats: ProviderStats = ZERO_STATS;
  constructor(
    private rows: ProviderBookingRow[] = [row()],
    private changes: ProviderTimelineRow[] = [],
    private members: ProviderMemberOption[] = [{ id: "mem-1", firstName: "Célia" }],
  ) {}
  async listForCustomer(): Promise<BookingListRow[]> { return []; }
  async findForCustomer(): Promise<BookingListRow | null> { return null; }
  async listForProvider(providerId: string, filter: ProviderListFilter, limit: number, offset: number) {
    this.calls.push(`list:${providerId}:${filter.tab}:${filter.q}:${filter.memberId}:${limit}:${offset}`);
    return this.rows.slice(offset, offset + limit);
  }
  async countForProvider() { return this.rows.length; }
  async findForProvider(bookingId: string, providerId: string) {
    this.calls.push(`find:${bookingId}:${providerId}`);
    return this.rows.find((r) => r.id === bookingId) ?? null;
  }
  async timelineFor(bookingId: string) {
    this.calls.push(`timeline:${bookingId}`);
    return this.changes;
  }
  async membersOf() { return this.members; }
  async statsForProvider(providerId: string): Promise<ProviderStats> {
    this.calls.push(`stats:${providerId}`);
    return this.stats;
  }
}

describe("toProviderBookingDetailDTO — the reveal rule", () => {
  it("hides phone, email and street line while the booking is awaiting the provider", () => {
    const dto = toProviderBookingDetailDTO(row(), [], NOW);
    expect(dto.customerPhone).toBeNull();
    expect(dto.customerEmail).toBeNull();
    expect(dto.addressLine).toBeNull();
    // The coarse location and the note stay: they are what decides the answer.
    expect(dto.addressDistrict).toBe("Polana");
    expect(dto.description).toBe("Cabelo curto");
  });

  it("hides them while payment is pending too", () => {
    const dto = toProviderBookingDetailDTO(row({ status: "PENDING_PAYMENT" }), [], NOW);
    expect(dto.customerPhone).toBeNull();
  });

  it.each(["CONFIRMED", "MARKED_DONE", "COMPLETED", "DISPUTED"])("reveals them at %s", (status) => {
    const dto = toProviderBookingDetailDTO(row({ status }), [], NOW);
    expect(dto.customerPhone).toBe("+258840000001");
    expect(dto.customerEmail).toBe("ana@example.com");
    expect(dto.addressLine).toBe("Av. Julius Nyerere 1234");
  });

  it("names a customer with no first name 'Cliente'", () => {
    expect(toProviderBookingDetailDTO(row({ customerFirstName: null }), [], NOW).customerFirstName).toBe("Cliente");
  });
});

describe("toProviderBookingDetailDTO — the timeline", () => {
  it("opens with creation, carries every change with its actor, and ends on the pending deadline", () => {
    const dto = toProviderBookingDetailDTO(
      row(),
      [{ changedAt: new Date("2026-09-04T09:30:00.000Z"), changedByUserId: "cust-1", reason: "submitted_by_customer" }],
      NOW,
    );
    expect(dto.timeline).toEqual([
      { at: "2026-09-04T09:00:00.000Z", reason: "created_by_customer", actor: "customer", pending: false },
      { at: "2026-09-04T09:30:00.000Z", reason: "submitted_by_customer", actor: "customer", pending: false },
      { at: "2026-09-04T11:00:00.000Z", reason: "respond_by", actor: "system", pending: true },
    ]);
  });

  it("derives the actor: the customer by id, null as the system, anyone else as the provider", () => {
    const dto = toProviderBookingDetailDTO(
      row({ status: "DECLINED", expiresAt: null }),
      [
        { changedAt: new Date("2026-09-04T09:30:00.000Z"), changedByUserId: "cust-1", reason: "submitted_by_customer" },
        { changedAt: new Date("2026-09-04T09:40:00.000Z"), changedByUserId: "owner-1", reason: "not_available" },
        { changedAt: new Date("2026-09-04T09:50:00.000Z"), changedByUserId: null, reason: "provider_did_not_respond" },
      ],
      NOW,
    );
    expect(dto.timeline.map((e) => e.actor)).toEqual(["customer", "customer", "provider", "system"]);
    expect(dto.timeline.some((e) => e.pending)).toBe(false);
  });

  it("names the pending hop pay_by while payment is pending", () => {
    const dto = toProviderBookingDetailDTO(row({ status: "PENDING_PAYMENT" }), [], NOW);
    expect(dto.timeline.at(-1)).toEqual({ at: "2026-09-04T11:00:00.000Z", reason: "pay_by", actor: "system", pending: true });
  });

  it("draws no pending hop once the deadline is behind now", () => {
    const dto = toProviderBookingDetailDTO(row({ expiresAt: new Date("2026-09-04T09:30:00.000Z") }), [], NOW);
    expect(dto.timeline.some((e) => e.pending)).toBe(false);
  });
});

describe("ListProviderBookingsProjection", () => {
  it("pages, counts, caps the limit and names the members", async () => {
    const repo = new FakeRepo([row({ id: "a" }), row({ id: "b" }), row({ id: "c" })]);
    const page = await new ListProviderBookingsProjection(repo).execute({
      providerId: "prov-1", tab: "requests", q: "  ana ", memberId: null, limit: 500, offset: 0, now: NOW,
    });
    expect(repo.calls).toEqual(["list:prov-1:requests:ana:null:51:0"]);
    expect(page.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(page.total).toBe(3);
    expect(page.nextOffset).toBeNull();
    expect(page.members).toEqual([{ id: "mem-1", firstName: "Célia" }]);
  });

  it("reports the next offset when a page is full", async () => {
    const repo = new FakeRepo([row({ id: "a" }), row({ id: "b" }), row({ id: "c" })]);
    const page = await new ListProviderBookingsProjection(repo).execute({
      providerId: "prov-1", tab: "requests", q: null, memberId: null, limit: 2, offset: 0, now: NOW,
    });
    expect(page.items).toHaveLength(2);
    expect(page.nextOffset).toBe(2);
  });

  it("carries respondBy only while awaiting the provider", async () => {
    const repo = new FakeRepo([row({ id: "a" }), row({ id: "b", status: "CONFIRMED" })]);
    const page = await new ListProviderBookingsProjection(repo).execute({
      providerId: "prov-1", tab: "requests", q: null, memberId: null, limit: 20, offset: 0, now: NOW,
    });
    expect(page.items[0]!.respondBy).toBe("2026-09-04T11:00:00.000Z");
    expect(page.items[1]!.respondBy).toBeNull();
  });
});

describe("GetProviderBookingProjection", () => {
  it("answers null for a booking the repository does not return", async () => {
    const repo = new FakeRepo([]);
    expect(await new GetProviderBookingProjection(repo).execute({ providerId: "prov-1", bookingId: "bk-x", now: NOW })).toBeNull();
    expect(repo.calls).toEqual(["find:bk-x:prov-1"]);
  });

  it("maps a found row through the timeline, reaching it with the row's own id", async () => {
    const repo = new FakeRepo(
      [row()],
      [{ changedAt: new Date("2026-09-04T09:30:00.000Z"), changedByUserId: "cust-1", reason: "submitted_by_customer" }],
    );
    const dto = await new GetProviderBookingProjection(repo).execute({ providerId: "prov-1", bookingId: "bk-1", now: NOW });
    expect(dto?.timeline).toHaveLength(3);
    expect(repo.calls).toEqual(["find:bk-1:prov-1", "timeline:bk-1"]);
  });
});

describe("fillDays", () => {
  it("returns thirty days ending on the provider's today, oldest first", () => {
    const days = fillDays("2026-09-03", []);
    expect(days).toHaveLength(30);
    expect(days[0]!.date).toBe("2026-08-05");
    expect(days.at(-1)!.date).toBe("2026-09-03");
  });

  it("keeps the days that have something and zeroes the ones that do not", () => {
    const days = fillDays("2026-09-03", STATS.perDay);
    expect(days.at(-1)).toEqual({ date: "2026-09-03", requests: 4, confirmed: 3 });
    expect(days.find((d) => d.date === "2026-09-01")).toEqual({ date: "2026-09-01", requests: 2, confirmed: 1 });
    expect(days.find((d) => d.date === "2026-09-02")).toEqual({ date: "2026-09-02", requests: 0, confirmed: 0 });
  });

  it("drops a day the repository returned from outside the window rather than making thirty-one", () => {
    const days = fillDays("2026-09-03", [{ date: "2026-01-01", requests: 9, confirmed: 9 }]);
    expect(days).toHaveLength(30);
    expect(days.some((d) => d.date === "2026-01-01")).toBe(false);
  });
});

describe("GetProviderStatsProjection", () => {
  it("hands the numbers through and fills the chart", async () => {
    const repo = new FakeRepo();
    repo.stats = STATS;
    const dto = await new GetProviderStatsProjection(repo).execute({
      providerId: "prov-1",
      now: new Date("2026-09-03T10:00:00.000Z"),
    });
    expect(repo.calls).toEqual(["stats:prov-1"]);
    expect(dto.revenueLast30Minor).toBe(1_240_000);
    expect(dto.perDay).toHaveLength(30);
    expect(dto.perDay.at(-1)).toEqual({ date: "2026-09-03", requests: 4, confirmed: 3 });
  });

  it("names a currency for a workspace that has never been booked", async () => {
    const repo = new FakeRepo();
    repo.stats = { totals: { ...STATS.totals, currency: null }, perDay: [] };
    const dto = await new GetProviderStatsProjection(repo).execute({
      providerId: "prov-1",
      now: new Date("2026-09-03T10:00:00.000Z"),
    });
    expect(dto.currency).toBe("MZN");
    expect(dto.perDay.every((d) => d.requests === 0 && d.confirmed === 0)).toBe(true);
  });
});
