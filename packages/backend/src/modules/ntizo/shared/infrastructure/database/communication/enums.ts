/**
 * Ships with one value in use. Phases 2 and 3 (support threads, oversight) are
 * agreed scope, so the column is known scope rather than speculation — adding
 * it later would mean a migration plus a backfill of every existing row.
 */
export const THREAD_TYPES = ["inquiry"] as const;
export type ThreadType = (typeof THREAD_TYPES)[number];
