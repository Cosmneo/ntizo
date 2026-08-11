import { useTranslation } from "react-i18next";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button, Input, Skeleton, cn } from "@ntizo/frontend-ui";

/**
 * The card every list in the app sits in.
 *
 * Extracted so the admin's provider queue and the workspace's people list are
 * the same object rather than two things that resemble each other — the header,
 * the count, the search box, the filter button and the row chrome have one
 * definition, and a change to any of them lands in both.
 *
 * A table on a wide screen and stacked cards on a narrow one. That is not two
 * designs: a five-column table on a phone is either a horizontal scroll nobody
 * finds or four columns squeezed into forty pixels, and both hide the thing the
 * list exists to show.
 *
 * Which is why a row is *described* here rather than rendered by the caller.
 * Handing this component `<tr>` elements — as it did — makes the mobile card
 * impossible: a table row cannot become a card, so the caller would have to
 * write the row twice and the two would drift. One description, two renderings.
 */

export interface CollectionColumn {
  key: string;
  label: string;
  align?: "right";
  /** Escape hatch for the first and last columns' outer padding. */
  className?: string;
  /**
   * Hide this column's label/value pair on the mobile card.
   *
   * For anything already said by the primary block — repeating it under a
   * label is noise on the screen with the least room for any.
   */
  hideOnCard?: boolean;
}

export interface CollectionRow {
  key: string;
  /**
   * The first column, and the top of the mobile card: whatever identifies the
   * row to a person. Usually an avatar next to a name and one line under it.
   */
  primary: React.ReactNode;
  /** Keyed by column key. Missing keys render as an em dash. */
  cells: Record<string, React.ReactNode>;
  /** The row's menu, if it has one. Last cell on desktop, top-right on mobile. */
  actions?: React.ReactNode;
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
  rows,
  emptyText,
  noMatchesText,
  filtered,
  skeletonRows,
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
  /** The first is the primary column; the rest are cells, in order. */
  columns: readonly CollectionColumn[];
  rows: readonly CollectionRow[];
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
}) {
  const { t } = useTranslation("provider");
  const isEmpty = !loading && rows.length === 0;
  // The first column is the primary block, rendered from `row.primary`; the
  // rest become cells on desktop and label/value pairs on mobile.
  const restColumns = columns.slice(1);
  const emptyMessage = filtered ? noMatchesText : emptyText;

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
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
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
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
              <span className="hidden sm:inline">{t("peopleFilter")}</span>
              {activeFilterCount > 0 && (
                <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-primary)] px-1.5 text-[11px] font-semibold text-[var(--color-primary-foreground)]">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* ── Wide screens: a table ─────────────────────────────────────────── */}
      <div className="hidden overflow-x-auto md:block">
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
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-[var(--color-border)] last:border-b-0"
                >
                  <td className="py-3.5 pl-5">{row.primary}</td>
                  {restColumns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "type-body py-3.5 pr-4",
                        column.align === "right" && "text-right",
                        column.className,
                      )}
                    >
                      {column.key === "actions"
                        ? row.actions
                        : (row.cells[column.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Narrow screens: one card per row ──────────────────────────────── */}
      <div className="border-t border-[var(--color-border)] md:hidden">
        {loading ? (
          <div className="grid gap-3 p-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton
                key={i}
                className="h-[104px] rounded-[var(--radius-card-sm)]"
              />
            ))}
          </div>
        ) : isEmpty ? (
          <p className="type-body px-4 py-12 text-center text-[var(--color-muted-foreground)]">
            {emptyMessage}
          </p>
        ) : (
          <ul className="grid list-none gap-3 p-4">
            {rows.map((row) => (
              <li
                key={row.key}
                className="rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">{row.primary}</div>
                  {row.actions && <div className="shrink-0">{row.actions}</div>}
                </div>

                {/* Label and value on one line each. A phone has one column, so
                    a column header at the top would leave the values orphaned
                    from what they mean. */}
                <dl className="mt-3 grid gap-2 border-t border-[var(--color-border)] pt-3">
                  {restColumns
                    .filter((c) => c.key !== "actions" && !c.hideOnCard)
                    .map((column) => (
                      <div
                        key={column.key}
                        className="flex items-baseline justify-between gap-4"
                      >
                        <dt className="type-caption shrink-0 text-[var(--color-muted-foreground)]">
                          {column.label}
                        </dt>
                        <dd className="type-body m-0 min-w-0 text-right">
                          {row.cells[column.key] ?? "—"}
                        </dd>
                      </div>
                    ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
