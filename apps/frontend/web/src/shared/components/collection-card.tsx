import { useTranslation } from "react-i18next";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button, Input, Skeleton, cn } from "@ntizo/frontend-ui";

/**
 * The card every list in the app sits in.
 *
 * Extracted so the admin's provider queue and the workspace's people list are
 * the same object rather than two things that resemble each other — the header,
 * the count, the search box, the filter button and the table chrome have one
 * definition, and a change to any of them lands in both.
 *
 * What is deliberately *not* shared is the rows. Those two lists answer
 * different questions and have different columns, and a component that tried to
 * render both would grow a prop for every difference until it described
 * nothing. The chrome is the same; the contents are the caller's.
 */

export interface CollectionColumn {
  key: string;
  label: string;
  align?: "right";
  /** Escape hatch for the first and last columns' outer padding. */
  className?: string;
}

export function CollectionCard({
  title,
  shown,
  total,
  loading,
  search,
  onSearchChange,
  searchPlaceholder,
  onOpenFilters,
  activeFilterCount = 0,
  columns,
  emptyText,
  noMatchesText,
  filtered,
  skeletonRows,
  children,
}: {
  title: string;
  shown: number;
  /** Before filtering. With a filter on, one number is a lie about the whole. */
  total: number;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  /** Omit to render no filter button — some lists have nothing to filter by. */
  onOpenFilters?: () => void;
  activeFilterCount?: number;
  columns: readonly CollectionColumn[];
  emptyText: string;
  /** Shown when filters hid everything — a different situation from empty. */
  noMatchesText: string;
  /**
   * Whether anything is currently filtering the list.
   *
   * Asked rather than deduced from `total === 0`, because a list filtered on
   * the server cannot know its own unfiltered size: the admin queue searched
   * for something with no matches would otherwise announce that the platform
   * has no providers at all.
   */
  filtered: boolean;
  skeletonRows: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation("provider");
  const isEmpty = !loading && shown === 0;

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
            {title}
          </p>
          <p className="type-body mt-0.5">
            {loading ? (
              <Skeleton className="h-[19px] w-24" />
            ) : (
              t("peopleShown", { shown, total })
            )}
          </p>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="pl-9"
            />
          </div>
          {onOpenFilters && (
            <Button type="button" variant="outline" onClick={onOpenFilters}>
              <SlidersHorizontal className="h-4 w-4" />
              {t("peopleFilter")}
              {activeFilterCount > 0 && (
                <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-primary)] px-1.5 text-[11px] font-semibold text-[var(--color-primary-foreground)]">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_35%,transparent)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "type-caption py-2.5 pr-4 text-left font-bold tracking-[0.1em] text-[var(--color-muted-foreground)] uppercase",
                    column.align === "right" && "text-right",
                    column.className,
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              skeletonRows
            ) : isEmpty ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="type-body px-5 py-14 text-center text-[var(--color-muted-foreground)]"
                >
                  {/* Two different situations. "Nobody here" invites you to add
                      somebody; "nothing matches" invites you to clear a filter,
                      and telling them apart is the difference between a useful
                      empty state and a dead end. */}
                  {filtered ? noMatchesText : emptyText}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
