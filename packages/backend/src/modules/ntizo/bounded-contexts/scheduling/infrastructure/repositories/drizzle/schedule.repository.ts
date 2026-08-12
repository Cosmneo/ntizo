import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  dateException,
  houseClosure,
  memberAvailability,
} from "../../../../../shared/infrastructure/database/scheduling/schemas";
import { serviceMember, serviceOption, service } from "../../../../../shared/infrastructure/database/catalog/schemas";
import { provider, providerMember } from "../../../../../shared/infrastructure/database/provider/schemas";
import type { MemberSchedule } from "../../../domain/aggregates/member-schedule.aggregate";
import type {
  ClosureRow,
  ScheduleRepositoryPort,
} from "../../../app/ports/outbound/schedule.repository.port";
import { toDomain, toRows } from "./member-schedule.mapper";

export class DrizzleScheduleRepository implements ScheduleRepositoryPort {
  async findByMember(providerId: string, memberId: string): Promise<MemberSchedule> {
    const db = getDb();
    const weekly = await db
      .select()
      .from(memberAvailability)
      .where(
        and(eq(memberAvailability.providerId, providerId), eq(memberAvailability.memberId, memberId)),
      );
    const exceptions = await db
      .select()
      .from(dateException)
      .where(and(eq(dateException.providerId, providerId), eq(dateException.memberId, memberId)));

    // No rows found reads the same as no rows written: `toDomain` builds an
    // empty schedule from two empty arrays, so "this member has set nothing
    // yet" needs no branch of its own here.
    return toDomain(providerId, memberId, weekly, exceptions);
  }

  /**
   * Deletes this member's `member_availability` and `date_exception` rows and
   * re-inserts them from the aggregate, in one transaction.
   *
   * Delete-and-reinsert is safe here specifically because neither table has
   * children: nothing references a weekly rule or an exception row, so
   * nothing cascades away when one is deleted. That is not true of every
   * aggregate in this codebase — `service_option` in the catalog is the
   * example to check against before copying this pattern elsewhere, because
   * it is gaining children of its own in this slice's successors, and at that
   * point deleting the parent row would take a child down with it that a
   * diff-and-patch update would have left alone.
   */
  async save(schedule: MemberSchedule): Promise<void> {
    const rows = toRows(schedule);
    const { providerId, memberId } = schedule;

    await getDb().transaction(async (tx) => {
      await tx
        .delete(memberAvailability)
        .where(
          and(eq(memberAvailability.providerId, providerId), eq(memberAvailability.memberId, memberId)),
        );
      if (rows.weekly.length) await tx.insert(memberAvailability).values(rows.weekly);

      await tx
        .delete(dateException)
        .where(and(eq(dateException.providerId, providerId), eq(dateException.memberId, memberId)));
      if (rows.exceptions.length) await tx.insert(dateException).values(rows.exceptions);
    });
  }

  async listClosures(providerId: string): Promise<ClosureRow[]> {
    const rows = await getDb()
      .select({
        id: houseClosure.id,
        fromDate: houseClosure.fromDate,
        toDate: houseClosure.toDate,
        note: houseClosure.note,
      })
      .from(houseClosure)
      .where(eq(houseClosure.providerId, providerId));
    return rows;
  }

  async addClosure(input: {
    providerId: string;
    fromDate: string;
    toDate: string;
    note: string | null;
  }): Promise<string> {
    const [row] = await getDb()
      .insert(houseClosure)
      .values({
        providerId: input.providerId,
        fromDate: input.fromDate,
        toDate: input.toDate,
        note: input.note,
      })
      .returning({ id: houseClosure.id });
    // The insert always returns the row it just wrote; a missing row here
    // would mean the database rejected it, which would already have thrown.
    return row!.id;
  }

  async removeClosure(providerId: string, closureId: string): Promise<void> {
    await getDb()
      .delete(houseClosure)
      .where(and(eq(houseClosure.id, closureId), eq(houseClosure.providerId, providerId)));
  }

  async listMembers(
    providerId: string,
  ): Promise<{ memberId: string; userId: string; role: string }[]> {
    return getDb()
      .select({
        memberId: providerMember.id,
        userId: providerMember.userId,
        role: providerMember.role,
      })
      .from(providerMember)
      .where(eq(providerMember.providerId, providerId));
  }

  async memberBelongsToProvider(providerId: string, memberId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: providerMember.id })
      .from(providerMember)
      .where(and(eq(providerMember.id, memberId), eq(providerMember.providerId, providerId)))
      .limit(1);
    return row !== undefined;
  }

  async isProviderMember(providerId: string, userId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: providerMember.id })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return row !== undefined;
  }

  async isProviderOwnerOrAdmin(providerId: string, userId: string): Promise<boolean> {
    const [row] = await getDb()
      .select({ role: providerMember.role })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    return row?.role === "owner" || row?.role === "admin";
  }

  /**
   * One query, not three: `isSelfOrProviderOwnerOrAdmin` used to be a natural
   * spot to write `isProviderMember` and then `isProviderOwnerOrAdmin` and
   * then compare ids, which is the same `provider_member` row fetched up to
   * three times. Reading it once and branching on what it says answers all
   * three questions this method actually needs answered.
   */
  async isSelfOrProviderOwnerOrAdmin(
    providerId: string,
    userId: string,
    targetMemberId: string,
  ): Promise<boolean> {
    const [row] = await getDb()
      .select({ id: providerMember.id, role: providerMember.role })
      .from(providerMember)
      .where(and(eq(providerMember.providerId, providerId), eq(providerMember.userId, userId)))
      .limit(1);
    if (!row) return false;
    return row.id === targetMemberId || row.role === "owner" || row.role === "admin";
  }

  async findServiceSchedulingInfo(serviceId: string): Promise<{
    serviceId: string;
    providerId: string;
    timezone: string;
    bufferMinutes: number;
    slotIntervalMinutes: number;
    bookingMode: "priced" | "quote";
    status: string;
    memberIds: string[];
    defaultOption: {
      pricingMode: "fixed" | "hourly";
      durationMinutes: number | null;
      minMinutes: number | null;
      stepMinutes: number | null;
    } | null;
  } | null> {
    const db = getDb();
    const [row] = await db
      .select({
        serviceId: service.id,
        providerId: service.providerId,
        timezone: provider.timezone,
        bufferMinutes: service.bufferMinutes,
        slotIntervalMinutes: service.slotIntervalMinutes,
        bookingMode: service.bookingMode,
        status: service.status,
      })
      .from(service)
      .innerJoin(provider, eq(provider.id, service.providerId))
      .where(eq(service.id, serviceId))
      .limit(1);
    if (!row) return null;

    const members = await db
      .select({ memberId: serviceMember.memberId })
      .from(serviceMember)
      .where(eq(serviceMember.serviceId, serviceId));

    // At most one per service — the partial unique index on `is_default`
    // guarantees it — so this is a lookup, not another one-to-many relation
    // to reconcile.
    const [defaultOption] = await db
      .select({
        pricingMode: serviceOption.pricingMode,
        durationMinutes: serviceOption.durationMinutes,
        minMinutes: serviceOption.minMinutes,
        stepMinutes: serviceOption.stepMinutes,
      })
      .from(serviceOption)
      .where(and(eq(serviceOption.serviceId, serviceId), eq(serviceOption.isDefault, true)))
      .limit(1);

    return {
      serviceId: row.serviceId,
      providerId: row.providerId,
      timezone: row.timezone,
      bufferMinutes: row.bufferMinutes,
      slotIntervalMinutes: row.slotIntervalMinutes,
      bookingMode: row.bookingMode as "priced" | "quote",
      status: row.status,
      memberIds: members.map((m) => m.memberId),
      defaultOption: defaultOption
        ? {
            pricingMode: defaultOption.pricingMode as "fixed" | "hourly",
            durationMinutes: defaultOption.durationMinutes,
            minMinutes: defaultOption.minMinutes,
            stepMinutes: defaultOption.stepMinutes,
          }
        : null,
    };
  }
}
