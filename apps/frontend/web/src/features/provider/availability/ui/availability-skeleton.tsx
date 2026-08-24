import { useTranslation } from "react-i18next";
import { Skeleton, useIsMobile } from "@ntizo/frontend-ui";

/**
 * The page's own shape, greyed, while `availability.config` is in flight.
 *
 * It replaces a spinner beside the words "Loading availability…" — one line at
 * the top left of an otherwise blank screen. Two things were wrong with that.
 * The page arrived as a jump: nothing, then a full board, with every control in
 * a position the reader had no chance to anticipate. And the sentence was the
 * only thing on screen, so a slow connection spent its whole wait telling the
 * provider that something was loading rather than what.
 *
 * So this mirrors the real layout band for band — scope strip, summary, rail,
 * week — at the same heights, which is what makes the swap read as the content
 * arriving rather than as the page rebuilding itself.
 *
 * `useIsMobile` for the same reason the week itself uses it: the phone gets an
 * agenda of seven rows, and drawing a seven-column grid here would promise a
 * layout that is about to be replaced by a different one.
 *
 * `aria-hidden`, with the live region carrying the only thing worth announcing.
 * A screen reader has no use for forty grey rectangles, and `role="status"`
 * with the sentence is what it actually needs — the same sentence the spinner
 * used, kept where it still helps.
 */
export function AvailabilitySkeleton() {
  const { t } = useTranslation("provider");
  const isMobile = useIsMobile();

  return (
    <div className="mx-auto grid w-full max-w-[86rem] gap-3">
      <p role="status" className="sr-only">
        {t("availabilityLoading")}
      </p>

      <div aria-hidden="true" className="grid gap-3">
        {/* Scope strip: three people and the week navigation. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2.5">
          {/* Clipped rather than scrollable: the real strip scrolls sideways
              because there may be more people than fit, but a placeholder that
              can be dragged is a control that does nothing. */}
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="grid gap-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-2 w-12" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <Skeleton className="h-9 w-9 rounded-[var(--radius-field)]" />
            <Skeleton className="h-9 min-w-0 flex-1 rounded-[var(--radius-field)] sm:w-52 sm:flex-none" />
            <Skeleton className="h-9 w-9 rounded-[var(--radius-field)]" />
          </div>
        </div>

        <Skeleton className="ml-1 h-3 w-56" />

        {/* Summary band, at the height the real one lands at. */}
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-muted)] px-5 py-4">
          <div className="grid gap-1.5">
            <Skeleton className="h-7 w-48 bg-[var(--color-border)]" />
            <Skeleton className="h-3 w-64 bg-[var(--color-border)]" />
          </div>
          <div className="grid gap-1.5">
            <Skeleton className="h-4 w-28 bg-[var(--color-border)]" />
            <Skeleton className="h-3 w-20 bg-[var(--color-border)]" />
          </div>
          <Skeleton className="ml-auto h-7 w-44 rounded-full bg-[var(--color-border)]" />
        </div>

        <div className="grid gap-3 lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start">
          {/* The week, first on a phone — as it is in the real page. */}
          <div className="order-first grid gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] p-3 lg:order-last lg:p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-40 rounded-full" />
              <Skeleton className="ml-auto h-8 w-36 rounded-[10px]" />
            </div>
            {isMobile ? <AgendaBones /> : <GridBones />}
          </div>

          {/* Control rail: the working week, then two shorter panels. */}
          <div className="grid content-start gap-3">
            <PanelBones rows={2} />
            <PanelBones rows={1} />
            <PanelBones rows={1} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Seven columns against an hour ruler, with the blocks a working week draws. */
function GridBones() {
  return (
    <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] gap-x-1">
      <div />
      {WEEK.map((_, i) => (
        <div key={i} className="grid justify-items-center gap-1 pb-2">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-6 w-6 rounded-full" />
        </div>
      ))}

      <div className="grid gap-[1.75rem] pt-1 pr-2 pl-1">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-2.5 w-9 justify-self-end" />
        ))}
      </div>
      {/* A working day and a shorter Saturday, so the shape that arrives is the
          shape that was promised. */}
      {WEEK.map((height, i) => (
        <div key={i} className="grid content-start gap-2 py-1">
          {height > 0 ? (
            <Skeleton className="rounded-[var(--radius-field)]" style={{ height: `${height}rem` }} />
          ) : (
            <div className="h-[6rem]" />
          )}
        </div>
      ))}
    </div>
  );
}

/** One row a day, as the phone draws the same week. */
function AgendaBones() {
  return (
    <div className="grid gap-1.5">
      {WEEK.map((height, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] px-3 py-2.5"
        >
          <div className="grid w-11 shrink-0 justify-items-center gap-1">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-6 w-6 rounded-full" />
          </div>
          <div className="flex flex-1 gap-1.5">
            {height > 0 && <Skeleton className="h-7 w-24 rounded-[var(--radius-field)]" />}
            {height > 8 && <Skeleton className="h-7 w-24 rounded-[var(--radius-field)]" />}
          </div>
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function PanelBones({ rows }: { rows: number }) {
  return (
    <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] p-3 lg:p-4">
      <Skeleton className="h-2.5 w-28" />
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="grid gap-2.5 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-3"
        >
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-1">
            {WEEK.map((_, d) => (
              <Skeleton key={d} className="h-6 flex-1 rounded-[6px]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Block heights per day, in rem — a five-day week with a half Saturday and a
 * blank Sunday.
 *
 * Invented rather than measured, because there is nothing to measure yet. The
 * point is only that the placeholder has the silhouette of a week instead of
 * seven identical bars, which is what stops the real data reading as a
 * different page.
 */
const WEEK = [11, 11, 11, 11, 11, 5, 0] as const;
