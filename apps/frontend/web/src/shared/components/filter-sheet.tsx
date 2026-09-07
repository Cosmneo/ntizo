import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button, Sheet, SheetContent } from "@ntizo/frontend-ui";

/**
 * The panel every list's filters open in: a sheet on the right, a title and
 * a close control at the top, the fields down the middle, and "Clear filters"
 * beside "Close" at the foot.
 *
 * Extracted from the provider queue, the user list and the workspace's people
 * list, which each carried a copy of these forty lines — and from which the
 * reviews, bookings, support, contact and activity lists then drifted, each
 * inventing its own row of toggle buttons above its card. A reader moving
 * between lists should find the filters in one place, opened one way, and the
 * only way to make that hold is for there to be one panel.
 *
 * Applied as they change, with no Apply button: the list is right there and
 * updates under the panel, so the result is the feedback. "Clear filters" is
 * live only while it would do something — a permanently-live clear reads as a
 * control that does nothing. The search box is deliberately not cleared from
 * here: it lives outside this panel, in sight, and clearing something the
 * reader cannot see from here is worse than leaving it.
 *
 * The words for "Close" and "Clear filters" are the `provider` namespace's,
 * the same choice `CollectionCard` makes for its own "Filter" and "N of M
 * shown": chrome shared by every zone has to read one namespace, and this is
 * the one it already reads.
 */
export function FilterSheet({
  open,
  onOpenChange,
  title,
  canClear,
  onClear,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is being filtered — "Filter providers", "Filter bookings". */
  title: string;
  /** Whether any filter is set, which is whether "Clear filters" does anything. */
  canClear: boolean;
  onClear: () => void;
  /** The fields, usually `FilterField`s. */
  children: ReactNode;
}) {
  const { t } = useTranslation("provider");
  const headingId = useId();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" labelledBy={headingId} className="flex w-full max-w-sm flex-col">
        <div className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 id={headingId} className="type-h3 font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("close")}
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 content-start gap-5 overflow-y-auto p-5">{children}</div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-4">
          <Button type="button" variant="ghost" disabled={!canClear} onClick={onClear}>
            {t("peopleClearFilters")}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** One labelled control in the panel. `id` must be the control's own, so the label reaches it. */
export function FilterField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={id}
        className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
