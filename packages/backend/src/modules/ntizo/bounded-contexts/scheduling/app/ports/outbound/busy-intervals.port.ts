export interface BusyIntervalsPort {
  /**
   * Time already taken, per member, per civil date.
   *
   * Slice 2 has no bookings, so the shipped adapter returns an empty map. The
   * engine's tests pass busy intervals directly, which is what proves the
   * subtraction before slice 4 supplies any.
   */
  forMembers(
    memberIds: readonly string[],
    fromDate: string,
    toDate: string,
  ): Promise<Map<string, { date: string; start: number; end: number }[]>>;
}
