import type { BusyIntervalsPort } from "../../../app/ports/outbound/busy-intervals.port";

/**
 * No bookings exist yet — that is slice 4.
 *
 * Shipped as a real adapter rather than an inline `[]` so slice 4 replaces one
 * class in one bootstrap line, and so the port is exercised by the same code
 * path that will carry real data.
 */
export class NoBookingsBusyAdapter implements BusyIntervalsPort {
  async forMembers(): Promise<Map<string, { date: string; start: number; end: number }[]>> {
    return new Map();
  }
}
