import * as React from "react";
import { cn } from "../lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  /** Secondary text on the right of the row — a code, a count, a note. */
  hint?: string;
  /** Rendered before the label. A flag, an emoji, an icon element. */
  adornment?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  /** Shown on the trigger when nothing is chosen. */
  placeholder?: string;
  /**
   * Force the search box on or off.
   *
   * Left alone it appears once the list is long enough to be worth filtering.
   * A search box above four options is furniture; its absence above forty is a
   * scroll nobody should have to do.
   */
  searchable?: boolean;
  searchPlaceholder?: string;
  noResultsText?: string;
  /** Fires when the popover opens or closes, so a caller can build its options lazily. */
  onOpenChange?: (open: boolean) => void;
  id?: string;
  name?: string;
  ariaLabel?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /**
   * Replaces the trigger's own classes.
   *
   * For the places a full-width bordered field is the wrong shape — the
   * calendar's month and year, which sit inline in a header. The popover keeps
   * its styling either way, so the list still looks like every other list.
   */
  triggerClassName?: string;
  /** Overrides the popover's width. Defaults to matching the trigger. */
  menuClassName?: string;
}

/**
 * Above this many options the search box appears on its own.
 *
 * Six, not eight: the eight app languages sat exactly on the old line and got
 * no search box, which is the one long-ish list a user actually hunts through.
 * Below six — a gender, a provider type, two member roles — the whole list is
 * visible at a glance and a search box is furniture.
 */
const SEARCHABLE_THRESHOLD = 6;

/**
 * The project's dropdown.
 *
 * One component rather than a native `<select>` per screen, because a native
 * select cannot be styled to match anything around it, cannot be searched, and
 * renders as a different control on every platform — three phones showed three
 * unrelated widgets for the same field. It also cannot carry a flag beside a
 * country or a code beside a currency, which half the fields here need.
 *
 * A hidden native input carries the value so the field still participates in
 * form submission and native `required` validation; the visible control is a
 * button, which is what it behaves like.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  searchable,
  searchPlaceholder,
  noResultsText,
  onOpenChange,
  id,
  name,
  ariaLabel,
  disabled,
  required,
  className,
  triggerClassName,
  menuClassName,
}: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = `${id ?? name ?? "select"}-listbox`;

  const showSearch = searchable ?? options.length > SEARCHABLE_THRESHOLD;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // The value is matched as well as the label so someone who knows the code
    // does not have to remember the interface's wording for it.
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const selected = React.useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  function setOpenState(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) setQuery("");
  }

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpenState(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (showSearch) searchRef.current?.focus();
    // Start on the current choice, so opening a filled field and pressing down
    // moves from where the user is rather than from the top of the list.
    const i = filtered.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => setActive(0), [query]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(option: SelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpenState(false);
    // Focus returns to the trigger, not to nothing. Losing it after a choice
    // sends the next Tab back to the top of the page.
    triggerRef.current?.focus();
  }

  function move(delta: number) {
    setActive((i) => {
      let next = i;
      // Step over disabled rows rather than stopping on one — an arrow key
      // that appears to do nothing reads as the control being broken.
      for (let step = 0; step < filtered.length; step += 1) {
        next = Math.min(Math.max(next + delta, 0), filtered.length - 1);
        if (!filtered[next]?.disabled) return next;
        if (next === 0 || next === filtered.length - 1) return i;
      }
      return i;
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpenState(true);
        return;
      }
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" || (e.key === " " && !open)) {
      if (!open) {
        e.preventDefault();
        setOpenState(true);
        return;
      }
      const option = filtered[active];
      if (option) {
        e.preventDefault();
        pick(option);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpenState(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {/* Carries the value into form submission and native validation. The
          visible control is a button, which cannot do either. */}
      <input type="hidden" name={name} value={value} required={required} />

      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpenState(!open)}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={
          triggerClassName ??
          "type-body flex h-11 w-full items-center gap-2.5 rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 text-left transition-colors hover:border-[var(--color-muted-foreground)] focus-visible:border-[var(--color-primary)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {selected?.adornment ? (
          <span aria-hidden="true" className="shrink-0">
            {selected.adornment}
          </span>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !selected && "text-[var(--color-muted-foreground)]",
          )}
        >
          {selected?.label ?? placeholder ?? ""}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform",
            open && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open ? (
        <div
          className={cn(
            "absolute z-50 mt-1.5 w-full overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-background)] shadow-lg",
            menuClassName,
          )}
        >
          {showSearch ? (
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3.5">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                className="type-body h-11 min-w-0 flex-1 bg-transparent placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none"
              />
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <p className="type-body px-3.5 py-6 text-center text-[var(--color-muted-foreground)]">
              {noResultsText}
            </p>
          ) : (
            <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1.5">
              {filtered.map((option, i) => {
                const chosen = option.value === value;
                return (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={chosen}
                    aria-disabled={option.disabled}
                    onMouseEnter={() => !option.disabled && setActive(i)}
                    // `mousedown`, so the choice lands before the search
                    // input's blur tears the popover down under the pointer.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(option);
                    }}
                    className={cn(
                      "type-body flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2.5",
                      i === active && !option.disabled && "bg-[var(--color-muted)]",
                      option.disabled && "cursor-not-allowed opacity-40",
                      chosen && "font-semibold",
                    )}
                  >
                    {option.adornment ? (
                      <span aria-hidden="true" className="shrink-0">
                        {option.adornment}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="type-caption shrink-0 text-[var(--color-muted-foreground)]">
                        {option.hint}
                      </span>
                    ) : null}
                    {/* A tick, not just bold text. Weight alone is invisible
                        on a one-word label. */}
                    {chosen ? (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-4 w-4 shrink-0 text-[var(--color-primary)]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
