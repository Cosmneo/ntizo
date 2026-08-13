import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button, Input } from "@ntizo/frontend-ui";
import {
  browseSearch,
  type BrowseSearch,
} from "@/features/directory/services/domain/browse-search";

/**
 * Two boxes and a button, unlike every other filter on this page.
 *
 * The rest are links, because a chip has a small closed set of values and each
 * one can be a URL. A price range cannot: there is no list of every pair a
 * person might type, and a link per keystroke would put a history entry
 * between them and the back button. So this one is a form — typed, then
 * submitted — and the submission is a navigation, which keeps the result a
 * URL somebody can send even though the control that produced it was not.
 *
 * Applied on submit rather than on change for the same reason. A request per
 * keystroke would fire four times for "1500" and show results for 1, 15 and
 * 150 on the way — three answers to questions nobody asked.
 */
export function PriceRangeFilter({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();

  // Whole units, as typed and as the URL carries them. Kept as strings rather
  // than numbers so a half-typed value and a cleared box stay distinguishable
  // — `Number("")` is 0, which is a bound meaning "free and up".
  const [min, setMin] = useState(current.minPrice?.toString() ?? "");
  const [max, setMax] = useState(current.maxPrice?.toString() ?? "");

  // The URL is the source of truth, not this state: the back button, a shared
  // link and the "clear filters" action all change it without going through
  // these boxes, and boxes still showing the old numbers would be lying about
  // what the list is currently filtered by.
  useEffect(() => {
    setMin(current.minPrice?.toString() ?? "");
    setMax(current.maxPrice?.toString() ?? "");
  }, [current.minPrice, current.maxPrice]);

  /** A typed box as a bound, or `undefined` for one left empty. */
  const bound = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (trimmed === "") return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
  };

  function apply() {
    const lo = bound(min);
    const hi = bound(max);
    void navigate({
      to: "/services",
      // Swapped when they arrive backwards rather than refused. Somebody who
      // typed 500 and 100 wants the range between them, and an error message
      // for a mistake this obvious is a worse answer than the results.
      search: browseSearch(current, {
        minPrice: lo !== undefined && hi !== undefined ? Math.min(lo, hi) : lo,
        maxPrice: lo !== undefined && hi !== undefined ? Math.max(lo, hi) : hi,
      }),
    });
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <Input
        value={min}
        onChange={(e) => setMin(e.target.value)}
        placeholder={t("filterPriceMin")}
        aria-label={t("filterPriceMin")}
        inputMode="numeric"
        className="h-9 min-w-0 flex-1 px-2.5 text-center"
      />
      <span aria-hidden="true" className="text-[var(--color-muted-foreground)]">
        –
      </span>
      <Input
        value={max}
        onChange={(e) => setMax(e.target.value)}
        placeholder={t("filterPriceMax")}
        aria-label={t("filterPriceMax")}
        inputMode="numeric"
        className="h-9 min-w-0 flex-1 px-2.5 text-center"
      />
      <Button type="submit" className="h-9 shrink-0 px-3">
        {t("filterPriceApply")}
      </Button>
    </form>
  );
}
