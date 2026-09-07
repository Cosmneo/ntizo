import { useTranslation } from "react-i18next";
import { Skeleton } from "@ntizo/frontend-ui";

/** Three fills a first screen without pretending to know how long the list is. */
const ROWS = 3;

/** Bar widths that vary a little, so the placeholder reads as rows rather than a pattern. */
const TITLE_WIDTHS = ["w-3/5", "w-1/2", "w-2/3"] as const;
const DETAIL_WIDTHS = ["w-2/5", "w-1/2", "w-1/3"] as const;

/**
 * The inbox's loading state, built to the height of the rows it stands in for.
 *
 * The page used to render nothing until the first page landed, then jump.
 * The bars here are the two text heights of `NotificationCell` (15 and 13)
 * against its 36px disc, on the same grid and the same hairlines, so the list
 * does not change height when the data arrives — the same rule
 * `ActivitySkeleton` follows, for the same reason.
 *
 * `role="status"` with a name rather than `aria-hidden`: a reader who cannot
 * see the bars is told the list is on its way instead of meeting a page that
 * says nothing at all.
 */
export function InboxSkeleton() {
  const { t } = useTranslation("notifications");

  return (
    <div role="status" aria-label={t("loading")} className="grid">
      {Array.from({ length: ROWS }, (_, i) => (
        <div
          key={i}
          className="grid grid-cols-[14px_36px_minmax(0,1fr)_auto] items-start gap-3.5 border-t border-[var(--color-border)] py-[15px] first:border-t-0"
        >
          <span />
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="grid gap-2 pt-1">
            <Skeleton className={`h-[15px] ${TITLE_WIDTHS[i % TITLE_WIDTHS.length]}`} />
            <Skeleton className={`h-[13px] ${DETAIL_WIDTHS[i % DETAIL_WIDTHS.length]}`} />
          </div>
          <Skeleton className="mt-1 h-[13px] w-10" />
        </div>
      ))}
    </div>
  );
}
