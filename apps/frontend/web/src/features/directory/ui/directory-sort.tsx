import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@ntizo/frontend-ui";
import {
  DIRECTORY_SORTS,
  directorySearch,
  type DirectorySearch,
  type DirectorySort,
} from "@/features/directory/domain/directory-search";

/**
 * The order the results are in, as one control.
 *
 * Five orders, so a menu rather than the row of links the services browse
 * uses — that one has two, and a menu to choose between two things is a click
 * spent hiding one of them. Five laid out flat is a line of small targets that
 * wraps on a narrow screen and reads as navigation rather than as a setting;
 * the trigger says which order is on without opening anything, which the row
 * could only do by highlighting one of five.
 *
 * **The options navigate rather than being links, and that is a real
 * trade-off.** Everything else on this page is a link, because a filtered list
 * is a URL somebody can send and the back button should undo it. Both of those
 * still hold here — choosing an order changes the URL, so it is shareable and
 * the back button walks it back. What is given up is opening a sort in a new
 * tab, and the no-JavaScript fallback. The second is given up by choosing a
 * menu at all: a popover cannot open without JavaScript however its contents
 * are marked up, so putting anchors inside would look like it preserved
 * something it does not.
 */
export function DirectorySort({ current }: { current: DirectorySearch }) {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();

  // `relevance` is the default, so it is what the trigger reads when the URL
  // says nothing about ordering.
  const active: DirectorySort = current.sort ?? "relevance";

  const choose = (value: DirectorySort) =>
    void navigate({
      to: "/providers",
      search: directorySearch(current, {
        // The default order is written as an absent parameter, not as
        // `sort=relevance`: `/providers` and `/providers?sort=relevance` are
        // one page, and two URLs for one page are two cache entries and two
        // things for a crawler to index.
        sort: value === "relevance" ? undefined : value,
        // A new order is a new first page. Page 3 of "best rated" is not page 3
        // of "cheapest", and keeping the offset lands the reader mid-list with
        // no idea why.
        offset: undefined,
      }),
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          aria-label={t("sortLabel")}
        >
          <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
          {t(`providerSort.${active}`)}
          <ChevronDown className="h-4 w-4 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[13rem]">
        {DIRECTORY_SORTS.map((value) => {
          const isActive = value === active;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => choose(value)}
              // `aria-checked` on a `menuitemradio`: these are five states of
              // one setting, not five separate actions, and a plain menuitem
              // would announce the chosen one exactly like the rest.
              role="menuitemradio"
              aria-checked={isActive}
              className={cn(
                "justify-between gap-6",
                isActive ? "font-semibold text-[var(--color-primary)]" : "",
              )}
            >
              {t(`providerSort.${value}`)}
              {/* Drawn only when chosen, and the row keeps its width either way
                  through the gap above — a tick that appears and disappears
                  must not shuffle the labels beside it. */}
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
