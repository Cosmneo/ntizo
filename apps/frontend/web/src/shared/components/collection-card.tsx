import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical, Search, SlidersHorizontal } from "lucide-react";
import { Button, Input, Skeleton, cn } from "@ntizo/frontend-ui";
import { EmptyCard } from "./empty-card";

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
  /**
   * Width of this column's placeholder while loading, as a utility class.
   *
   * A guess at how wide the real value tends to be — an email is not a badge.
   * Only the width: everything else about the placeholder is decided here, so
   * the loading state cannot drift from the loaded one column by column.
   */
  skeletonWidth?: string;
  /**
   * What this column's placeholder is shaped like.
   *
   * A badge is 2px taller than a line of text and reads as a pill rather than
   * a bar — the only column shape a caller has to say out loud, because it is
   * the only one the column descriptor cannot see for itself.
   */
  skeletonShape?: "text" | "badge";
}

/**
 * The width at which this card stops stacking rows and starts drawing a table.
 *
 * `md` is the default and what every list here used before there was a choice.
 * It is a *viewport* breakpoint, though, and two of the app's zones put a
 * 16rem sidebar beside their content — so at a 768px viewport an admin list is
 * drawing a table into a 462px box. That is fine for a four-column list and
 * not for one whose last column holds buttons: they end up off the right edge,
 * reachable only by finding the horizontal scroll. A list that needs more room
 * than `md` gives it says so here rather than every list paying for its width.
 */
export type CollectionBreakpoint = "md" | "lg" | "xl";

/**
 * Written out in full, never composed, because Tailwind reads source text: a
 * class assembled as `` `${bp}:block` `` produces no rule at all.
 */
const TABLE_AT: Record<CollectionBreakpoint, string> = {
  md: "hidden overflow-x-auto md:block",
  lg: "hidden overflow-x-auto lg:block",
  xl: "hidden overflow-x-auto xl:block",
};
const CARDS_BELOW: Record<CollectionBreakpoint, string> = {
  md: "border-t border-[var(--color-border)] md:hidden",
  lg: "border-t border-[var(--color-border)] lg:hidden",
  xl: "border-t border-[var(--color-border)] xl:hidden",
};

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
  action,
  onOpenFilters,
  activeFilterCount = 0,
  columns,
  rows,
  emptyText,
  emptyTitle,
  emptyBadge,
  emptyAction,
  noMatchesText,
  noMatchesTitle,
  filtered,
  skeletonPlaceholders = 5,
  reorder,
  totalUnknown = false,
  tableFrom = "md",
}: {
  title: string;
  shown: number;
  /**
   * Before filtering. With a filter on, one number is a lie about the whole
   * — and so is this one, whenever `totalUnknown` is set, no matter what it
   * holds; pass anything (e.g. `shown` again) and it is ignored.
   */
  total: number;
  loading: boolean;
  /** Omit all three to render no search box — a card that shows a fixed few rows has nothing to search. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Rendered where the search box would be: the dashboard's "Ver todas →". */
  action?: ReactNode;
  /** Omit to render no filter button — some lists have nothing to filter by. */
  onOpenFilters?: () => void;
  activeFilterCount?: number;
  /** The first is the primary column; the rest are cells, in order. */
  columns: readonly CollectionColumn[];
  rows: readonly CollectionRow[];
  /**
   * What to say when the list is empty.
   *
   * Reads as the card's body when `emptyTitle` is given and as its title when
   * it is not, so a caller that has only ever passed one sentence keeps
   * working and says the same thing it always did.
   */
  emptyText: string;
  /** The headline over `emptyText`. */
  emptyTitle?: string;
  /** The glyph badged onto the brand mark — what this list would hold. */
  emptyBadge?: ComponentType<{ className?: string }>;
  /** The way out of the empty state, when the reader has one. */
  emptyAction?: ReactNode;
  /** Shown when filters hid everything — a different situation from empty. */
  noMatchesText: string;
  /** The headline over `noMatchesText`. Same fallback as `emptyTitle`. */
  noMatchesTitle?: string;
  /**
   * Whether anything is currently filtering the list.
   *
   * Asked rather than deduced from `total === 0`, because a list filtered on
   * the server cannot know its own unfiltered size: the admin queue searched
   * for something with no matches would otherwise announce that the platform
   * has no providers at all.
   */
  filtered: boolean;
  /** How many rows to draw while loading. Five fills a screen without lying. */
  skeletonPlaceholders?: number;
  /**
   * Makes the table rows draggable, and reports the new order.
   *
   * Desktop only, and that is not an omission: HTML5 drag events do not fire
   * for touch, and a handle a finger cannot use is a control that lies about
   * being one. A list that offers this must also offer moving a row from its
   * menu — which works by keyboard, by touch, and by mouse — and that lives
   * with the caller, because only the caller knows what its rows can do.
   */
  reorder?: {
    /** The complete list of row keys, in their new order. */
    onReorder: (orderedKeys: string[]) => void;
    /** Accessible name for the handle, e.g. "Reorder". */
    handleLabel: string;
    /**
     * Set when dragging cannot express a real order right now — a filtered or
     * searched list is a subset, and rearranging a subset says nothing about
     * where those rows sit among the ones not shown. The handles are drawn
     * disabled with this as their tooltip rather than removed, so the control
     * does not vanish and reappear as somebody types.
     */
    disabledReason?: string | undefined;
  };
  /**
   * Set when `total` is not an authoritative count — a cursor-paged list
   * that has not reached its last page, say, where the backend never
   * returns a count at all. Swaps the header's "N of N shown" for a plain
   * "N shown": asserting a total the caller cannot know is worse than not
   * asserting one.
   */
  totalUnknown?: boolean;
  /**
   * The width from which rows are drawn as a table rather than as cards.
   *
   * `md` by default, which is what every list drew before this existed. Raise
   * it when the row carries controls the table would push off its right edge
   * in a zone whose sidebar has already taken 16rem of the viewport — see
   * `CollectionBreakpoint`.
   */
  tableFrom?: CollectionBreakpoint;
}) {
  const { t } = useTranslation("provider");
  const isEmpty = !loading && rows.length === 0;
  // The first column is the primary block, rendered from `row.primary`; the
  // rest become cells on desktop and label/value pairs on mobile.
  const restColumns = columns.slice(1);
  // Built once and rendered into whichever of the two layouts is on screen.
  // They are the same card — writing it in both branches is how the table and
  // the phone drift apart.
  const emptyCard = filtered ? (
    // A search glyph, not the brand: the rows are there, the filter is hiding
    // them, and the mark would announce an empty account instead.
    <EmptyCard
      icon={Search}
      title={noMatchesTitle ?? noMatchesText}
      body={noMatchesTitle ? noMatchesText : undefined}
    />
  ) : (
    <EmptyCard
      badge={emptyBadge}
      title={emptyTitle ?? emptyText}
      body={emptyTitle ? emptyText : undefined}
      action={emptyAction}
    />
  );
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const canDrag = Boolean(reorder && !reorder.disabledReason);

  /** Moves the dragged row to where it was dropped and reports the whole list. */
  function dropOn(targetKey: string) {
    if (!reorder || !draggingKey || draggingKey === targetKey) return;
    const keys = rows.map((r) => r.key);
    const from = keys.indexOf(draggingKey);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]!);
    reorder.onReorder(keys);
  }

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
            ) : totalUnknown ? (
              t("peopleShownPartial", { shown })
            ) : (
              t("peopleShown", { shown, total })
            )}
          </p>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
          {onSearchChange && searchPlaceholder !== undefined && (
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
              <Input
                value={search ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-9"
              />
            </div>
          )}
          {action}
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
      <div className={TABLE_AT[tableFrom]}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_35%,transparent)]">
              {/* Deliberately unlabelled: a column header over a drag handle
                  would be read out on every row and names nothing. */}
              {reorder && <th className="w-8" aria-hidden="true" />}
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
              <TableSkeleton
                columns={columns}
                restColumns={restColumns}
                count={skeletonPlaceholders}
                hasHandle={Boolean(reorder)}
              />
            ) : isEmpty ? (
              <tr>
                <td colSpan={columns.length + (reorder ? 1 : 0)} className="p-0">
                  {emptyCard}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.key}
                  // `draggable` on the row, not on the handle: a handle alone
                  // drags a 16px icon and shows the reader nothing about what
                  // is moving. The handle is what says the row can move.
                  draggable={canDrag}
                  onDragStart={() => setDraggingKey(row.key)}
                  onDragEnd={() => setDraggingKey(null)}
                  onDragOver={(e) => {
                    // Without this the drop event never fires — the default
                    // action of dragover is to refuse the drop.
                    if (canDrag) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropOn(row.key);
                    setDraggingKey(null);
                  }}
                  className={cn(
                    "border-b border-[var(--color-border)] last:border-b-0",
                    draggingKey === row.key && "opacity-40",
                  )}
                >
                  {reorder && (
                    <td className="w-8 pl-3">
                      <span
                        aria-label={reorder.handleLabel}
                        title={reorder.disabledReason ?? reorder.handleLabel}
                        className={cn(
                          "grid h-8 w-5 place-items-center text-[var(--color-muted-foreground)]",
                          canDrag
                            ? "cursor-grab active:cursor-grabbing"
                            : "cursor-not-allowed opacity-40",
                        )}
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                    </td>
                  )}
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
      <div className={CARDS_BELOW[tableFrom]}>
        {loading ? (
          <CardSkeleton
            restColumns={restColumns}
            count={skeletonPlaceholders}
            hasActions={columns.some((c) => c.key === "actions")}
          />
        ) : isEmpty ? (
          emptyCard
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

/**
 * The primary column while it loads: a monogram and the two lines under it.
 *
 * Every list built on this card puts an avatar and a name over a secondary
 * line in its first column, so the shape is the card's rather than each
 * caller's — three call sites were writing the same twelve lines.
 */
function PrimarySkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      {/* No gap: the two lines it stands in for are adjacent `<p>` with no
          margin between them, and 19 + 17 is exactly the 36px the avatar
          beside them is tall. A gap here makes the text block the taller of
          the two and every row grows by it. */}
      <div className="grid">
        <Skeleton className="h-[19px] w-36" />
        <Skeleton className="h-[17px] w-52 max-w-full" />
      </div>
    </div>
  );
}

/**
 * The table's loading state, drawn from the same columns as the rows.
 *
 * Generated rather than handed in. The callers used to pass a `<tr>` fragment
 * they wrote by hand, which meant a new column appeared in the table and not
 * in its skeleton — the header would say five things and the placeholder show
 * four, and nothing fails when that happens.
 */
function TableSkeleton({
  columns,
  restColumns,
  count,
  hasHandle,
}: {
  columns: readonly CollectionColumn[];
  restColumns: readonly CollectionColumn[];
  count: number;
  hasHandle: boolean;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <tr
          key={i}
          className="border-b border-[var(--color-border)] last:border-b-0"
        >
          {hasHandle && <td className="w-8" />}
          <td className={cn("py-3.5", columns[0]?.className ?? "pl-5")}>
            <PrimarySkeleton />
          </td>
          {restColumns.map((column) => (
            <td
              key={column.key}
              className={cn(
                "type-body py-3.5",
                column.className ?? "pr-4",
                column.align === "right" && "text-right",
              )}
            >
              {column.key === "actions" ? (
                <Skeleton className="ml-auto h-8 w-8 rounded-full" />
              ) : (
                // Inline, so the cell's line box gives the row the height the
                // real text gives it, and so `text-align` reaches it — a
                // block-level placeholder ignores alignment, which is what put
                // the actions menu 88px left of its own column.
                <Skeleton
                  className={cn(
                    "inline-block align-middle",
                    column.skeletonShape === "badge"
                      ? "h-[22px] rounded-full"
                      : "h-[13px]",
                    column.skeletonWidth ?? "w-24",
                  )}
                />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * The phone's loading state: the card, not a grey block standing in for one.
 *
 * The block was 104px against a real card's 213 and there were three of them
 * against eight rows, so the page more than quintupled in height the moment it
 * loaded. Built from the same columns as the real card, the height follows
 * from the same structure instead of from a number somebody has to remember to
 * update.
 */
function CardSkeleton({
  restColumns,
  count,
  hasActions,
}: {
  restColumns: readonly CollectionColumn[];
  count: number;
  hasActions: boolean;
}) {
  const pairs = restColumns.filter((c) => c.key !== "actions" && !c.hideOnCard);

  return (
    <div className="grid gap-3 p-4">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <PrimarySkeleton />
            </div>
            {hasActions && <Skeleton className="h-8 w-8 shrink-0 rounded-full" />}
          </div>
          <dl className="mt-3 grid gap-2 border-t border-[var(--color-border)] pt-3">
            {pairs.map((column) => (
              // The same classes as the real pair, so the line box sets the
              // row height exactly as it does when there is text in it. A
              // block placeholder sizes itself instead, and made every row
              // 19px against the real 23 — four pairs a card, five cards, and
              // the list grows by a hundred pixels the moment it loads.
              <div
                key={column.key}
                className="flex items-baseline justify-between gap-4"
              >
                <dt className="type-caption shrink-0">
                  <Skeleton className="inline-block h-[12px] w-16 align-middle" />
                </dt>
                <dd className="type-body m-0 min-w-0">
                  <Skeleton
                    className={cn(
                      "inline-block align-middle",
                      column.skeletonShape === "badge"
                        ? "h-[22px] rounded-full"
                        : "h-[13px]",
                      column.skeletonWidth ?? "w-24",
                    )}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
