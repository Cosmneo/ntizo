import type { NotificationDTO } from "@ntizo/shared/read-models";

export type InboxGroupKey = "today" | "yesterday" | "earlier";

export interface InboxGroup {
  key: InboxGroupKey;
  items: NotificationDTO[];
}

/**
 * An inbox split into the three headings people actually scan for.
 *
 * Calendar days, not elapsed hours: something from 23:50 last night is
 * "yesterday" at 00:10 this morning, and calling it "2 hours ago" is technically
 * true and useless for finding it again.
 *
 * Three buckets rather than one per date. A heading per day turns a quiet week
 * into seven headings over seven single rows, which is more chrome than content.
 *
 * **Empty groups are never emitted.** A heading with nothing under it reads as a
 * section that failed to load rather than as a day when nothing happened.
 *
 * The order within a group is whatever the caller passed — the query already
 * returns newest first, and re-sorting here would be a second opinion about an
 * ordering the database already settled.
 */
export function groupByDay(items: NotificationDTO[], todayIso: string): InboxGroup[] {
  const today = dayNumber(todayIso);

  const buckets: Record<InboxGroupKey, NotificationDTO[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };

  for (const item of items) {
    const delta = today - dayNumber(item.createdAt);
    // Negative deltas — a row stamped in the future by a clock skew — land in
    // `today` rather than in a fourth bucket nobody designed a heading for.
    if (delta <= 0) buckets.today.push(item);
    else if (delta === 1) buckets.yesterday.push(item);
    else buckets.earlier.push(item);
  }

  return (["today", "yesterday", "earlier"] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, items: buckets[key] }));
}

/** Whole days since the epoch, in UTC — the unit the comparison above is in. */
function dayNumber(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 86_400_000);
}
