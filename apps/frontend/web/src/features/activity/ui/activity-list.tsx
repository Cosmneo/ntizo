import { Activity } from "lucide-react";
import { Skeleton } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import type { ActivityEntry } from "../domain/types";

/**
 * A feed of what happened, for whichever zone renders it.
 *
 * One component for all three — the provider's workspace, the customer's
 * account, the admin console — because a list of events is the same object in
 * each; only the events differ. What each zone supplies is its own words, so
 * "what happened here" can be a workspace, a person or a platform without the
 * list needing to know which.
 *
 * The strings arrive as props rather than through `useTranslation` for that
 * reason: a namespace would have to be one zone's, and the other two would be
 * borrowing it. `renderDescription` is the same idea applied to one row: the
 * list gets `type` + `payload`, and only the zone knows the `activityType.*`
 * namespace to read them through — see `domain/types.ts`'s `activityTypeKey`.
 */
export function ActivityList({
  entries,
  loading,
  title,
  hint,
  emptyTitle,
  emptyBody,
  locale,
  renderDescription,
  skeletonRows = 5,
}: {
  entries: readonly ActivityEntry[];
  loading: boolean;
  title: string;
  /** The line under the title, saying what this list covers. */
  hint?: string;
  emptyTitle: string;
  emptyBody: string;
  locale: string;
  /** Turns one entry's `type` + `payload` into the sentence this zone shows. */
  renderDescription: (entry: ActivityEntry) => string;
  /** How many placeholders to draw. Five fills a screen without lying. */
  skeletonRows?: number;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <div className="px-4 py-4 sm:px-5">
        <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
          {title}
        </p>
        {hint && (
          <p className="type-body mt-0.5 text-[var(--color-muted-foreground)]">
            {hint}
          </p>
        )}
      </div>

      <div className="border-t border-[var(--color-border)]">
        {loading ? (
          <ActivitySkeleton rows={skeletonRows} />
        ) : entries.length === 0 ? (
          <EmptyCard badge={Activity} title={emptyTitle} body={emptyBody} />
        ) : (
          <ul className="grid list-none gap-0 p-0">
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                locale={locale}
                description={renderDescription(entry)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** One event: what it was and when. */
function EntryRow({
  entry,
  locale,
  description,
}: {
  entry: ActivityEntry;
  locale: string;
  description: string;
}) {
  const when = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(entry.occurredAt));

  return (
    <li className="flex items-center justify-between gap-4 border-t border-[var(--color-border)] px-4 py-3.5 first:border-t-0 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
          <Activity className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="type-body-medium truncate font-semibold">
            {description}
          </p>
          <p className="type-caption truncate text-[var(--color-muted-foreground)]">
            {when}
          </p>
        </div>
      </div>
    </li>
  );
}

/**
 * The loading state, built to the height of the row it stands in for.
 *
 * The bars are the same heights as the text they replace — 15 and 13 against a
 * 32px disc — so the list does not change height the moment the data lands.
 * A shorter placeholder is not a smaller mistake; it is the page jumping under
 * somebody's cursor.
 */
function ActivitySkeleton({ rows }: { rows: number }) {
  return (
    <ul className="grid list-none gap-0 p-0">
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-4 border-t border-[var(--color-border)] px-4 py-3.5 first:border-t-0 sm:px-5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="grid gap-1.5">
              <Skeleton className="h-[15px] w-44 max-w-full" />
              <Skeleton className="h-[13px] w-28" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
