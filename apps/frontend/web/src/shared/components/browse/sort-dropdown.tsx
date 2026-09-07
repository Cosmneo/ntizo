import { Check, ChevronDown } from "lucide-react";
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
  triggerClassName,
  onChoose,
}: {
  /** The order presently in force — `undefined` when the URL says nothing. */
  active: Sort | undefined;
  /** Every order this page offers, default first. */
  options: ReadonlyArray<SortDropdownOption<Sort>>;
  /**
   * What the trigger is *for* — "Sort:" — read in front of the order it is
   * showing, and now drawn rather than hidden: the trigger is plain text on
   * the heading's right ("Sort: Newest ⌄"), so the word is on screen and the
   * button is named by what it says. It was an `sr-only` span while an icon
   * carried the meaning for sighted readers; with the word visible a second
   * copy for assistive technology would be the same word twice. Not an
   * `aria-label`, then or now: that would replace the order with "Sort", so
   * the one thing this control exists to state would be visible and nowhere
   * else, and voice control needs the visible words to be in the name to act
   * on them (WCAG 2.5.3, Label in Name).
   */
  sortLabel: string;
  /**
   * Where this copy of the control is standing, from the page that placed it.
   * The two placements are the heading's right (`hidden lg:inline-flex`, so
   * the phone gets one sort and not two) and the phone's floating capsule
   * (`floatingControlClass()`), which is why nothing here paints its own
   * ground or its own ink — see `text-inherit` below.
   */
  triggerClassName?: string;
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
        {/* `text-inherit`, not a colour of its own: this same button is drawn
            on the white heading row and inside the phone's navy capsule, and
            a token painted here would be navy ink on navy ground in the
            second. It also turns off `ghost`'s own blue, which would have put
            the page's one blue somewhere other than the header's search
            button. The muted prefix is `opacity`, for the same reason — a
            grey token legible on white is not legible on navy. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("gap-1.5 px-2.5 text-inherit hover:bg-[var(--color-muted)]", triggerClassName)}
        >
          <span className="font-medium opacity-65">{sortLabel}</span>
          <span className="font-bold">{current?.label}</span>
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
