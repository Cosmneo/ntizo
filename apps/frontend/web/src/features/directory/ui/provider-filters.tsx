import { useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FilterBar, FilterPill } from "@/shared/components/browse/filter-pill";
import { FilterSheet } from "@/shared/components/browse/filter-sheet";
import {
  FloatingControls,
  floatingControlClass,
} from "@/shared/components/browse/floating-controls";
import { SortDropdown, type SortDropdownOption } from "@/shared/components/browse/sort-dropdown";
import { FacetBox, FacetCount, facetOptionClass } from "@/shared/components/browse/facet-panel";
import { EXACT_MATCH } from "@/shared/components/browse/active-match";
import {
  directorySearch,
  PROVIDER_KINDS,
  RATING_THRESHOLDS,
  type DirectorySearch,
  type DirectorySort,
} from "@/features/directory/domain/directory-search";
import {
  directoryFilterChips,
  type FilterChip,
} from "@/features/directory/domain/directory-chips";
import { useProviderCities } from "@/features/directory/viewmodel/use-directory";
import { DirectoryPriceFilter } from "@/features/directory/ui/directory-price-filter";

/**
 * Everything the pill bar can narrow, taken off at once — but not what was
 * typed.
 *
 * Exactly the set `directoryFilterChips` lists other than `q`, and for the
 * same reasons the category and the sort are kept: the **category is kept**,
 * because the strip above the results is still showing it and clearing
 * something visible from a control somewhere else reads as a bug; the
 * **sort is kept**, because an order is not a narrowing and clearing filters
 * should not also reorder what is left.
 *
 * **The term is kept too.** It lives in the header's search pill now, which
 * has its own way off; a "Clear all" under a bar of empty pills that also
 * wiped what the reader typed would be taking something this control never
 * showed as on.
 *
 * `offset: undefined` because page 4 of a narrower result set is usually past
 * the end of it — a reader who cleared their filters would land on an empty
 * page having asked for a fuller one.
 */
export function clearedDirectorySearch(current: DirectorySearch): DirectorySearch {
  return directorySearch(current, {
    city: undefined,
    providerType: undefined,
    minRating: undefined,
    verified: undefined,
    minPrice: undefined,
    maxPrice: undefined,
    offset: undefined,
  });
}

/**
 * Every order this directory offers, default first — `SortDropdown`'s menu.
 *
 * Written once because the page draws this control twice: on the heading's
 * right for a wide screen and inside the phone's floating capsule. Two copies
 * of the list is how a sixth order gets added to one of them and the phone
 * quietly goes on offering five, which is the same drift the `*Options`
 * components and `ClearAll` exist to prevent.
 *
 * Takes `t` rather than calling `useTranslation` itself: it is a list, not a
 * component, and both callers already hold the namespace.
 */
export function providerSortOptions(
  t: (key: string) => string,
): ReadonlyArray<SortDropdownOption<DirectorySort>> {
  return [
    { value: undefined, label: t("sortOption.default") },
    { value: "rating", label: t("sortOption.rating") },
    { value: "reviews", label: t("sortOption.reviews") },
    { value: "price", label: t("sortOption.price") },
    { value: "name", label: t("sortOption.name") },
  ];
}

/**
 * Writes the chosen order and resets to the first page — page 3 of "best
 * rated" is not page 3 of "cheapest".
 *
 * `directorySearch` is what keeps every other filter and writes the default
 * order as an absent parameter rather than `sort=relevance`; `/providers` and
 * `/providers?sort=relevance` would otherwise be one page at two URLs.
 *
 * Curried on the router and the search so both placements of the control hand
 * it the same three arguments, for the same reason `providerSortOptions` is
 * one list: a second copy is a second thing to forget to fix.
 */
export function chooseProviderSort(
  navigate: ReturnType<typeof useNavigate>,
  current: DirectorySearch,
): (value: DirectorySort | undefined) => void {
  return (value) =>
    void navigate({
      to: "/providers",
      search: directorySearch(current, { sort: value, offset: undefined }),
    });
}

/**
 * A star threshold as this reader writes a decimal.
 *
 * Spelling it "4,5" by replacing the point was right for one language and
 * wrong for the other seven the platform ships. Exported because the phone's
 * quick chip offers the same 4.5 threshold the rating pill does, and two
 * copies of the formatting is how the chip and the pill come to print the
 * same number two different ways.
 */
export function formatRatingScore(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1 }).format(value);
}

/**
 * How many narrowings this bar is showing as on.
 *
 * `q` is not one of them, for the same reason `clearedDirectorySearch` keeps
 * it: the typed term belongs to the header's search pill, and a count that
 * included it would put a number on a control that offers no way to take it
 * off. See R18.
 */
function appliedCount(current: DirectorySearch): number {
  return directoryFilterChips(current).filter((c) => c.key !== "q").length;
}

/** The small link that sits on a filled pill and takes just that filter off. */
const PILL_CLEAR_CLASS =
  "grid h-[18px] w-[18px] place-items-center rounded-full text-[var(--color-navy-on)] transition-colors hover:bg-white/20";

function PillClear({ search, label }: { search: DirectorySearch; label: string }) {
  const { t } = useTranslation("directory");
  return (
    <Link
      to="/providers"
      activeOptions={EXACT_MATCH}
      search={search}
      aria-label={t("filterPillRemove", { filter: label })}
      className={PILL_CLEAR_CLASS}
    >
      <X className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
}

/** The chip for one group, or nothing when that group is not narrowing anything. */
function chipFor(chips: FilterChip[], key: string): FilterChip | undefined {
  return chips.find((c) => c.key === key);
}

/**
 * The link that takes every narrowing off at once, or nothing at all.
 *
 * Nothing to clear is not a disabled link — it is no link. Asked of
 * `directoryFilterChips` rather than counted again here, because that
 * function already enumerates exactly the set `clearedDirectorySearch` drops;
 * a second list is a second place for the two to disagree. Gated on the chips
 * other than `q`: the term is the header search pill's to clear, not this
 * bar's, so a search with only a typed term on gets no clear-all here.
 *
 * One component, two placements: the end of the pill bar and the footer of
 * the phone's sheet. A second copy is how the two would come to offer
 * different URLs.
 *
 * `onNavigate` is the sheet's way of closing behind itself; it sits in the
 * footer, outside the `closeOnChoice` wrapper that closes on a chosen option.
 * The bar passes nothing, because there is nothing to close.
 */
function ClearAll({ current, onNavigate }: { current: DirectorySearch; onNavigate?: () => void }) {
  const { t } = useTranslation("directory");
  if (appliedCount(current) === 0) return null;

  return (
    <Link
      to="/providers"
      activeOptions={EXACT_MATCH}
      search={clearedDirectorySearch(current)}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className="type-caption font-semibold text-[var(--color-headline)] underline underline-offset-[3px] hover:opacity-80"
    >
      {t("filtersClearAll")}
    </Link>
  );
}

/**
 * The directory's filters, as a row of pills above the results.
 *
 * The successor to `ProviderFacets`' sidebar, and the same contract: every
 * option is a **link**, never a form control. A filtered list is a URL
 * somebody can send, the back button undoes a filter, and the whole thing
 * works before any JavaScript has run — a `<details>` pill opens on its own
 * `<summary>` with no script at all, which matters on a page built to be
 * crawled.
 *
 * `active` and the `×` on a filled pill both come from `directoryFilterChips`
 * rather than being worked out again here: that function already enumerates
 * exactly what is narrowing the list and exactly the URL that removes each
 * one, and a second copy of that logic is a second place for the two to
 * disagree. Only the city pill breaks that pattern on purpose — see the
 * comment on it below.
 *
 * Five pills, and only the filters this data can honestly answer. The price
 * bound runs on the business's cheapest published option, which is the same
 * number its row prints as "from" — so a business can never be hidden by a
 * range it visibly satisfies.
 *
 * The option rows themselves are the `*Options` components below, shared with
 * `MobileProviderFilters` — one definition, two placements. A second copy for
 * the small screen is how the two stop offering the same filters, and how the
 * phone's count once came to count a city its sheet had no group for.
 */
export function ProviderFilters({ current }: { current: DirectorySearch }) {
  const { t } = useTranslation("directory");
  const cities = useProviderCities();
  const chips = directoryFilterChips(current);

  const ratingChip = chipFor(chips, "minRating");
  const priceChip = chipFor(chips, "price");
  const kindChip = chipFor(chips, "providerType");
  const verifiedChip = chipFor(chips, "verified");
  const cityChip = chipFor(chips, "city");

  const ratingLabel = t("filterRating");
  const priceLabel = t("filterPrice");
  const kindLabel = t("filterProviderKind");
  const verifiedLabel = t("filterVerification");
  const cityLabel = t("filterCity");

  return (
    <FilterBar>
      <FilterPill
        label={ratingLabel}
        active={ratingChip ? t(ratingChip.label.key, ratingChip.label.values ?? {}) : undefined}
        clear={ratingChip && <PillClear search={ratingChip.next} label={ratingLabel} />}
      >
        <RatingOptions current={current} />
      </FilterPill>

      {/* The one group that is not a closed set, so the one that is not links
          — see `DirectoryPriceFilter`, which explains why a range has to be
          typed and submitted. */}
      <FilterPill
        label={priceLabel}
        active={priceChip ? t(priceChip.label.key, priceChip.label.values ?? {}) : undefined}
        clear={priceChip && <PillClear search={priceChip.next} label={priceLabel} />}
      >
        <DirectoryPriceFilter current={current} />
      </FilterPill>

      <FilterPill
        label={kindLabel}
        active={kindChip ? t(kindChip.label.key, kindChip.label.values ?? {}) : undefined}
        clear={kindChip && <PillClear search={kindChip.next} label={kindLabel} />}
      >
        <KindOptions current={current} />
      </FilterPill>

      {/* A single-option pill: there is nothing to choose between, only to
          switch on or off, so the group is one row rather than a list. */}
      <FilterPill
        label={verifiedLabel}
        active={verifiedChip ? t(verifiedChip.label.key, verifiedChip.label.values ?? {}) : undefined}
        clear={verifiedChip && <PillClear search={verifiedChip.next} label={verifiedLabel} />}
      >
        <VerifiedOption current={current} />
      </FilterPill>

      {/* Only when there is more than one place to choose between. A city
          filter offering a single city narrows nothing and takes a pill of
          the bar to say so. Its `active` is `current.city` itself, not
          `directoryFilterChips`' "in {{city}}" chip text — that sentence reads
          right beside the results, but a pill that filled with the whole
          sentence instead of just the place would be the only one on the bar
          not simply naming what was picked. */}
      {cities.length > 1 && (
        <FilterPill
          label={cityLabel}
          active={current.city}
          clear={cityChip && <PillClear search={cityChip.next} label={cityLabel} />}
        >
          <CityOptions current={current} />
        </FilterPill>
      )}

      {/* Nothing to clear is not a disabled link — it is no link, and the
          typed term is not one of the things it clears. See `ClearAll`. */}
      <ClearAll current={current} />
    </FilterBar>
  );
}

/**
 * The filters on a phone: one navy control at the thumb, opening a sheet.
 *
 * The successor to `MobileDirectoryFilterBar`'s full-width bar, and the reason
 * that bar's spacer is gone: the capsule is narrow and centred rather than a
 * strip across the screen, so it never sits over the last row or the pager.
 *
 * Two halves, because a control with one half is a button: the filters, with
 * how many are on, and the same `SortDropdown` the heading row carries — the
 * heading's copy is `hidden lg:inline-flex`, so a phone shows exactly one
 * sort. Its options and its chooser are `providerSortOptions` and
 * `chooseProviderSort`, the same two the page hands its own copy: this
 * component takes the search and nothing else, and a private list here would
 * be the phone offering a different set of orders the day a sixth is added.
 *
 * The mockup draws "Filtros / Mapa" here rather than a sort. The map is phase
 * two — providers carry a city and a district, never a point — so this
 * capsule is the services page's two halves until there is a map to switch
 * to, rather than a toggle that goes nowhere.
 *
 * The sheet holds the same option rows the pills hold, stacked into headed
 * groups instead of hidden behind five summaries — a sheet is a screen, not a
 * toolbar, and there is nothing here to save room for. They are literally the
 * same components: two copies is how a phone quietly stops offering a filter
 * its own count is counting.
 *
 * Its footer button states the outcome — "Show 38 results" — rather than
 * saying "Apply", because a reader should know what they did before they
 * commit to it, not after.
 */
export function MobileProviderFilters({
  current,
  total,
}: {
  current: DirectorySearch;
  /** How many results the current search matched, for the sheet's own button. */
  total: number;
}) {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();
  const cities = useProviderCities();
  const [open, setOpen] = useState(false);
  const count = appliedCount(current);

  return (
    <>
      <FloatingControls>
        <button type="button" onClick={() => setOpen(true)} className={floatingControlClass()}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {t("filtersTitle")}
          {/* Beside the word rather than in a badge on top of it: the capsule
              is one line of text, and a counter bubble on a 44px control is a
              second thing to aim at. */}
          {count > 0 && ` · ${String(count)}`}
        </button>

        <SortDropdown
          active={current.sort}
          options={providerSortOptions(t)}
          sortLabel={t("sortTrigger")}
          triggerClassName={floatingControlClass()}
          onChoose={chooseProviderSort(navigate, current)}
        />
      </FloatingControls>

      <FilterSheet
        open={open}
        onOpenChange={setOpen}
        title={t("filtersTitle")}
        clear={<ClearAll current={current} onNavigate={() => setOpen(false)} />}
        apply={t("filterSheetApply", { count: total })}
        onApply={() => setOpen(false)}
      >
        <SheetGroup label={t("filterRating")}>
          <RatingOptions current={current} />
        </SheetGroup>

        <SheetGroup label={t("filterPrice")}>
          <DirectoryPriceFilter current={current} />
        </SheetGroup>

        <SheetGroup label={t("filterProviderKind")}>
          <KindOptions current={current} />
        </SheetGroup>

        <SheetGroup label={t("filterVerification")}>
          <VerifiedOption current={current} />
        </SheetGroup>

        {cities.length > 1 && (
          <SheetGroup label={t("filterCity")}>
            <CityOptions current={current} />
          </SheetGroup>
        )}
      </FilterSheet>
    </>
  );
}

/**
 * One headed group inside the sheet.
 *
 * A heading and its rows, not a `<details>`: the pills collapse because five
 * open groups do not fit on a toolbar, and the sheet is a screen with room
 * for all of them. Making the reader open each one here would be one tap per
 * filter for nothing.
 */
function SheetGroup({
  label,
  hint,
  children,
}: {
  label: string;
  /** A line under the heading, where the label alone would overclaim. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[var(--color-border)] py-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold tracking-[0.05em] text-[var(--color-muted-foreground)] uppercase">
        {label}
      </h3>
      {hint && <p className="type-caption mt-2 text-[var(--color-muted-foreground)]">{hint}</p>}
      <div className="mt-3 grid">{children}</div>
    </section>
  );
}

function RatingOptions({ current }: { current: DirectorySearch }) {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <>
      {RATING_THRESHOLDS.map((v) => (
        <FacetOption
          key={v}
          label={t("filterRatingOption", { score: formatRatingScore(v, locale) })}
          active={current.minRating === v}
          value={String(v)}
          toSearch={(raw) =>
            directorySearch(current, {
              minRating:
                raw == null ? undefined : (Number(raw) as (typeof RATING_THRESHOLDS)[number]),
              offset: undefined,
            })
          }
        />
      ))}
    </>
  );
}

function KindOptions({ current }: { current: DirectorySearch }) {
  const { t } = useTranslation("directory");
  return (
    <>
      {PROVIDER_KINDS.map((v) => (
        <FacetOption
          key={v}
          label={t(`filterProviderKindOption.${v}`)}
          active={current.providerType === v}
          value={v}
          toSearch={(providerType) => directorySearch(current, { providerType, offset: undefined })}
        />
      ))}
    </>
  );
}

function VerifiedOption({ current }: { current: DirectorySearch }) {
  const { t } = useTranslation("directory");
  return (
    <FacetOption
      label={t("filterVerifiedOnly")}
      active={current.verified === true}
      value="verified"
      // `verified: false` is never written — see `directorySearch`, which
      // drops it. Turning the filter off is turning the parameter off.
      toSearch={(v) => directorySearch(current, { verified: v != null, offset: undefined })}
    />
  );
}

function CityOptions({ current }: { current: DirectorySearch }) {
  const cities = useProviderCities();
  return (
    <>
      {cities.map((c) => (
        <FacetOption
          key={c.city}
          label={c.city}
          active={current.city === c.city}
          count={c.count}
          value={c.city}
          toSearch={(city) => directorySearch(current, { city, offset: undefined })}
        />
      ))}
    </>
  );
}

/**
 * One option row.
 *
 * It builds no search of its own: `toSearch` comes from the group, which is
 * the only place that knows which parameter this row changes. That is what
 * keeps "clicking the active one clears it" written once for five groups.
 */
function FacetOption({
  label,
  active,
  value,
  count,
  toSearch,
}: {
  label: string;
  active: boolean;
  value: string;
  /** Only the cities are counted server-side; every other group renders none. */
  count?: number;
  toSearch: (value: string | undefined) => DirectorySearch;
}) {
  return (
    <Link
      to="/providers"
      activeOptions={EXACT_MATCH}
      // Clicking the active one clears it: a filter you set by clicking should
      // come off the same way, without hunting for a separate "clear" the
      // pill would otherwise need.
      search={toSearch(active ? undefined : value)}
      // A link, not a checkbox: it navigates, a filtered list is a URL somebody
      // can send, and the back button undoes it. `aria-pressed` is what says
      // it is a toggle; `FacetBox` is only a picture of that state.
      aria-pressed={active}
      className={facetOptionClass(active)}
    >
      <FacetBox active={active} />
      {label}
      {count != null && <FacetCount value={count} />}
    </Link>
  );
}
