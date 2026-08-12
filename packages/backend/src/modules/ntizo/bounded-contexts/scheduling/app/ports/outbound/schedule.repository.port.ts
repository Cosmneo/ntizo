import type { MemberSchedule } from "../../../domain/aggregates/member-schedule.aggregate";

export interface ClosureRow {
  id: string;
  fromDate: string;
  toDate: string;
  note: string | null;
}

export interface ScheduleRepositoryPort {
  /** An empty schedule rather than null — "this member has set nothing yet" is a state, not a miss. */
  findByMember(providerId: string, memberId: string): Promise<MemberSchedule>;
  /** Replaces this member's weekly rows and exception rows wholesale. */
  save(schedule: MemberSchedule): Promise<void>;
  listClosures(providerId: string): Promise<ClosureRow[]>;
  addClosure(input: {
    providerId: string;
    fromDate: string;
    toDate: string;
    note: string | null;
  }): Promise<string>;
  /** True when a row was actually deleted — false when `closureId` didn't match one of this provider's closures (never existed here, or already removed). */
  removeClosure(providerId: string, closureId: string): Promise<boolean>;
  /** Every member id of this workspace, with its role and display name. */
  listMembers(
    providerId: string,
  ): Promise<{ memberId: string; userId: string; role: string; name: string | null }[]>;
  memberBelongsToProvider(providerId: string, memberId: string): Promise<boolean>;
  isProviderMember(providerId: string, userId: string): Promise<boolean>;
  isProviderOwnerOrAdmin(providerId: string, userId: string): Promise<boolean>;
  /**
   * Where this workspace's wall clock runs.
   *
   * Read straight off the provider row rather than derived from anything —
   * the timezone is chosen explicitly on the availability screen, and
   * `findServiceSchedulingInfo` already carries a copy scoped to one
   * service; this is the provider-wide read the configuration screen needs
   * without a service id in hand.
   */
  findProviderTimezone(providerId: string): Promise<string>;
  /**
   * Whether this person may edit that member's calendar.
   *
   * A third sibling to the two the catalog introduced, not a flag on either.
   * A day off is the member's own knowledge; closing the calendar of someone
   * who is ill and not answering is the manager's necessity.
   */
  isSelfOrProviderOwnerOrAdmin(
    providerId: string,
    userId: string,
    targetMemberId: string,
  ): Promise<boolean>;
  /** The timezone and slot inputs the engine needs, in one round trip. */
  findServiceSchedulingInfo(serviceId: string): Promise<{
    serviceId: string;
    providerId: string;
    timezone: string;
    bufferMinutes: number;
    slotIntervalMinutes: number;
    bookingMode: "priced" | "quote";
    status: string;
    /**
     * The owning workspace's `ProviderStatus`.
     *
     * Carried beside the service's own status because the two refusals are the
     * same refusal: a service is askable only when it is published *and* its
     * provider is trading. The column defaults to `pending`, so a workspace
     * that has never been reviewed holds live service ids from the moment it
     * creates one — and it can hand those ids out directly, without ever
     * appearing in a listing.
     */
    providerStatus: string;
    memberIds: string[];
    defaultOption: {
      pricingMode: "fixed" | "hourly";
      durationMinutes: number | null;
      minMinutes: number | null;
      stepMinutes: number | null;
    } | null;
  } | null>;
}
