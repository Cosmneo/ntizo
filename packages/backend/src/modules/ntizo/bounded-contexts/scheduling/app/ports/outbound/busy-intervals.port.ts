export interface BusyIntervalsPort {
  /**
   * Time already taken, per member, per civil date.
   *
   * `date` and the `start`/`end` minutes-from-midnight are all expressed in
   * the **provider's** timezone, not UTC and not the caller's — the same
   * timezone `ListServiceAvailability` reads the day's schedule in, since it
   * groups these rows by `date` and subtracts them from that day's rules
   * directly. Computing either side in a different zone is a silent shift,
   * not an error: it frees a booked slot on one day and blocks a free one on
   * whichever day the shift landed on instead.
   *
   * A member with no busy time is simply absent from the map, never present
   * with an empty array — `ListServiceAvailability` reads
   * `busyByMember.get(memberId) ?? []`, so there is nothing for an empty
   * entry to add.
   *
   * `DrizzleBookingBusyAdapter` is the real implementation: only bookings
   * whose status is in `SLOT_HOLDING_STATUSES` count, and a booking that
   * crosses local midnight comes back as two intervals, one per civil date it
   * touches.
   */
  forMembers(
    memberIds: readonly string[],
    fromDate: string,
    toDate: string,
  ): Promise<Map<string, { date: string; start: number; end: number }[]>>;
}
