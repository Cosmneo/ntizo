import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@ntizo/frontend-ui";

/** One order the menu offers, and the label it shows for it. */
export interface SortDropdownOption<Sort extends string> {
  /**
   * The `sort` param this row writes. `undefined` for the default order,
   * which `browseSearch`/`directorySearch` write as an absent parameter
   * rather than a value of its own — `/services` and `/services?sort=default`
   * would otherwise be one page at two URLs.
   */
  value: Sort | undefined;
  label: string;
}

/**
 * The order the results are in, as one control — shared by `/services` and
 * `/providers` rather than built twice. The two pages are deliberate twins
 * (see `ServicesBrowsePage`'s and `DirectoryPage`'s own doc comments), and a
 * sort control that existed in a different shape on each is exactly the drift
 * that made them twins in the first place.
 *
 * A menu, not the row of pills it replaces. Providers alone offers five
 * orders, and five laid out flat is a line of small targets that wraps onto
 * its own row on a narrow screen and reads as navigation rather than as a
 * setting. The trigger states which order is on without opening anything,
 * which a row of pills can only do by highlighting one of them.
 *
 * **The options navigate rather than being links, and that is a real
 * trade-off.** Everything else on these pages is a link, because a filtered
 * list is a URL somebody can send and the back button should undo it. Both of
 * those still hold here: choosing an order changes the URL, so it is
 * shareable and the back button walks it back. What is given up is opening a
 * sort in a new tab, and the no-JavaScript fallback. The second is given up by
 * choosing a menu at all: a popover cannot open without JavaScript however its
 * contents are marked up, so putting anchors inside would look like it
 * preserved something it does not.
 *
 * `onChoose` rather than a `to`/`search` pair — the same reason `Pager` takes
 * `renderPage` instead of building its own links: each page's URL is typed
 * against its own route and its own search shape, and a shared component that
 * built the navigation itself would have to erase both.
 */
export function SortDropdown<Sort extends string>({
  active,
  options,
  sortLabel,
  onChoose,
}: {
  /** The order presently in force — `undefined` when the URL says nothing. */
  active: Sort | undefined;
  /** Every order this page offers, default first. */
  options: ReadonlyArray<SortDropdownOption<Sort>>;
  /**
   * What the trigger is *for* — "Sort" — said in front of the order it is
   * showing. Not the trigger's whole name: an `aria-label` here would replace
   * the order with the word "Sort", so the one thing this control exists to
   * state would be visible and nowhere else. Voice control needs the visible
   * words to be in the name to act on them (WCAG 2.5.3, Label in Name).
   */
  sortLabel: string;
  /**
   * Writes the chosen order. Built by the page from `browseSearch` /
   * `directorySearch` — never by hand, which is the bug those two functions
   * exist to end — so every other filter survives and the page resets to its
   * first result.
   */
  onChoose: (value: Sort | undefined) => void;
}) {
  // Falls back to the first option — the default, by the contract above —
  // rather than to `undefined`, so the trigger always has a label to show
  // even if `active` is a value this page no longer offers.
  const current = options.find((option) => option.value === active) ?? options[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
        >
          <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
          {/* Read, not seen — the icon says this to a sighted reader and says
              nothing to anyone else. In front of the order rather than
              replacing it, so the button is named "Sort: Newest" and the word
              on screen is part of what it is called. */}
          <span className="sr-only">{sortLabel}: </span>
          {current?.label}
          <ChevronDown className="h-4 w-4 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[13rem]">
        {options.map((option) => {
          const isActive = option === current;
          return (
            <DropdownMenuItem
              key={option.value ?? "default"}
              onSelect={() => onChoose(option.value)}
              // `aria-checked` on a `menuitemradio`: these are several states
              // of one setting, not several separate actions, and a plain
              // menuitem would announce the chosen one exactly like the rest.
              role="menuitemradio"
              aria-checked={isActive}
              className={cn(
                "justify-between gap-6",
                isActive ? "font-semibold text-[var(--color-primary)]" : "",
              )}
            >
              {option.label}
              {/* Drawn only when chosen, and the row keeps its width either
                  way through the gap above — a tick that appears and
                  disappears must not shuffle the labels beside it. */}
              {isActive ? (
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <span aria-hidden="true" className="h-4 w-4 shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
