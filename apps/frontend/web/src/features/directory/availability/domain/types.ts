import type {
  AvailabilityDayDTO,
  AvailabilityStartDTO,
  ServiceAvailabilityDTO,
} from "@ntizo/shared/read-models";

export type { ServiceAvailabilityDTO, AvailabilityDayDTO };

/**
 * One bookable moment, exactly as `availability.forService` sends it.
 *
 * Named `Start` rather than re-exported under the DTO's own name because
 * this feature's UI layer (`time-grid.tsx`, `day-strip.ts`'s `groupByHour`)
 * reads it constantly and a short, local name is worth having.
 */
export type Start = AvailabilityStartDTO;

/**
 * Every distinct performer id, sorted into a stable order — the member
 * picker's own roster.
 *
 * Takes the response's top-level `memberIds` (who performs the service,
 * full stop) rather than deriving one from `days[].starts[].memberIds` (who
 * is free *this window*). The two used to be conflated here, and that was a
 * real, shipped bug: a roster built from a window collapses to whoever the
 * query happened to be scoped to the moment that window has no free starts
 * at all — a member on leave that week, or simply the person already
 * selected, once their own filtered response no longer mentions anyone
 * else. That silently erased the picker's "anyone" option too, stranding
 * the visitor. The top-level field is deliberately window- and
 * filter-independent (see `service-availability.schema.ts`'s own doc
 * comment), so a picker built from it can never lose an option just because
 * this particular week, or this particular person, has nothing free.
 *
 * Also never carries names — `availability.forService` answers "who is
 * free" by id only, the same choice `providerPublicReadModel` already made
 * deliberately for a workspace's own staff list (see that schema's own doc
 * comment: `members`/`invites` are never on the public tier). See
 * `member-picker.tsx` for how it labels ids instead of names.
 *
 * Sorted by id, not by array order: a position on the picker drifting
 * between one fetch and the next would be a worse bug than an arbitrary
 * order that is at least always the same order. De-duplicated defensively,
 * even though the server's own `service_member` row is unique per
 * (service, member) — a `Set` costs nothing here and this function is the
 * one place a duplicate would otherwise reach the picker.
 */
export function distinctMemberIds(memberIds: readonly string[]): string[] {
  return [...new Set(memberIds)].sort();
}

export type PanelMode = "quote" | "grid";

/**
 * Which of the two very different screens a response calls for.
 *
 * Never `data.days.length === 0`: a priced service is equally empty over a
 * window that is entirely closed, and reading emptiness itself as "this is
 * a quote service" swaps one screen for the other — the exact ambiguity
 * `bookingMode` was added to the read model to remove (see that schema's own
 * doc comment), and the exact mistake a previous slice already shipped once
 * as a mislabelled "By quote" card. `bookingMode` is the one field that
 * actually answers the question; this function exists so nothing else in
 * this feature is tempted to ask `days` instead.
 */
export function panelMode(data: Pick<ServiceAvailabilityDTO, "bookingMode" | "days">): PanelMode {
  return data.bookingMode === "quote" ? "quote" : "grid";
}
