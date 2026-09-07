/**
 * What is owed, in the order somebody is waiting on it: a customer whose
 * money is in dispute, a business waiting to trade, a person waiting on
 * support, a person who wrote in. Four sources, and the row shows the first
 * three that are above zero — the spec's "at most three cards, each only
 * when its count is above zero", applied to more sources than three.
 */
export type NeedsYouKey = "disputed" | "providers" | "support" | "contact";

export interface NeedsYouItem {
  key: NeedsYouKey;
  count: number;
}

export const NEEDS_YOU_ORDER: readonly NeedsYouKey[] = ["disputed", "providers", "support", "contact"];
export const NEEDS_YOU_LIMIT = 3;

/** How many applications the dashboard lists: enough to see who is new, few enough to stay a glance. */
export const LATEST_APPLICATIONS_LIMIT = 5;

export function needsYou(counts: Partial<Record<NeedsYouKey, number | undefined>>): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  for (const key of NEEDS_YOU_ORDER) {
    const count = counts[key];
    if (count !== undefined && count > 0) items.push({ key, count });
  }
  return items.slice(0, NEEDS_YOU_LIMIT);
}
