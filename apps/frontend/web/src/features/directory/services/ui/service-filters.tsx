import { useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LOCALES } from "@ntizo/shared";
import { FilterBar, FilterPill } from "@/shared/components/browse/filter-pill";
import { FilterSheet } from "@/shared/components/browse/filter-sheet";
import {
  FloatingControls,
  floatingControlClass,
} from "@/shared/components/browse/floating-controls";
import {
  SortDropdown,
  type SortDropdownOption,
} from "@/shared/components/browse/sort-dropdown";
import { FacetBox, FacetCount, facetOptionClass } from "@/shared/components/browse/facet-panel";
import { EXACT_MATCH } from "@/shared/components/browse/active-match";
import {
  browseSearch,
  type BrowseSearch,
} from "@/features/directory/services/domain/browse-search";
import {
  browseFilterChips,
  type FilterChip,
} from "@/features/directory/services/domain/browse-chips";
import type { BrowseSort } from "@/features/directory/services/domain/types";
import { useServiceCities } from "@/features/directory/services/viewmodel/use-browse-services";
import { PriceRangeFilter } from "@/features/directory/services/ui/price-range-filter";

/**
 * The four places a service can happen.
 *
 * Spelled here rather than read from the server: they are a closed set the
 * database's own CHECK enforces, and a filter offering whatever happened to
 * be in the data would quietly lose an option the day nobody had chosen it
 * yet.
 */
export const LOCATION_TYPES = ["remote", "at_provider", "at_customer", "flexible"] as const;

/**
 * The three ways a customer can pay, as they experience them.
 *
 * Flattened from two fields — `bookingMode` and the default option's
 * `pricingMode` — because "fixed price, per hour, or ask" is one question to
 * a customer and two columns to the schema. See `SERVICE_PAYMENT_MODES`.
 */
export const PAYMENT_MODES = ["fixed", "hourly", "quote"] as const;

/** A person, or an establishment with staff. */
export const PROVIDER_KINDS = ["individual", "organization"] as const;

/**
 * The languages a listing can be written in.
 *
 * Taken from `LOCALES` rather than spelled again: this is the same closed set
 * the translation step offers a provider, and a language the platform gained
 * must appear here without anybody remembering this file.
 *
 * What it filters is which languages the *listing* is readable in — see
 * `filterLanguageHint`, which says so on screen. It is not a claim about what
 * the provider speaks, because nothing in the product records that yet.
 */
export const LANGUAGES = LOCALES;

/**
 * Everything the pill bar can narrow, taken off at once — but not what was
 * typed.
 *
 * Exactly the set `browseFilterChips` lists other than `q`, and for the same
 * reasons the category and the sort are kept: the **category is kept**,
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
export function clearedBrowseSearch(current: BrowseSearch): BrowseSearch {
  return browseSearch(current, {
    locationType: undefined,
    paymentMode: undefined,
    providerType: undefined,
    language: undefined,
    city: undefined,
    minPrice: undefined,
    maxPrice: undefined,
    offset: undefined,
  });
}

/**
 * How many narrowings this bar is showing as on.
 *
 * `q` is not one of them, for the same reason `clearedBrowseSearch` keeps it:
 * the typed term belongs to the header's search pill, and a count that
 * included it would put a number on a control that offers no way to take it
 * off. See R18.
 */
function appliedCount(current: BrowseSearch): number {
  return browseFilterChips(current).filter((c) => c.key !== "q").length;
}

/** The small link that sits on a filled pill and takes just that filter off. */
const PILL_CLEAR_CLASS =
  "grid h-[18px] w-[18px] place-items-center rounded-full text-[var(--color-navy-on)] transition-colors hover:bg-white/20";

function PillClear({ search, label }: { search: BrowseSearch; label: string }) {
  const { t } = useTranslation("directory");
  return (
    <Link
      to="/services"
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
 * `browseFilterChips` rather than counted again here, because that function
 * already enumerates exactly the set `clearedBrowseSearch` drops; a second
 * list is a second place for the two to disagree.
 *
 * One component, two placements: the end of the pill bar and the footer of the
 * phone's sheet. A second copy is how the two started offering different
 * URLs — the sheet's once cleared the typed term the bar's kept.
 *
 * `onNavigate` is the sheet's way of closing behind itself; it sits in the
 * footer, outside the `closeOnChoice` wrapper that closes on a chosen option.
 * The bar passes nothing, because there is nothing to close.
 */
function ClearAll({ current, onNavigate }: { current: BrowseSearch; onNavigate?: () => void }) {
  const { t } = useTranslation("directory");
  if (appliedCount(current) === 0) return null;

  return (
    <Link
      to="/services"
      activeOptions={EXACT_MATCH}
      search={clearedBrowseSearch(current)}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className="type-caption font-semibold text-[var(--color-headline)] underline underline-offset-[3px] hover:opacity-80"
    >
      {t("filtersClearAll")}
    </Link>
  );
}

/**
 * The browse's filters, as a row of pills above the results.
 *
 * The successor to `ServiceFacets`' sidebar, and the same contract: every
 * option is a **link**, never a form control. A filtered list is a URL
 * somebody can send, the back button undoes a filter, and the whole thing
 * works before any JavaScript has run — a `<details>` pill opens on its own
 * `<summary>` with no script at all, which matters on a page built to be
 * crawled.
 *
 * `active` and the `×` on a filled pill both come from `browseFilterChips`
 * rather than being worked out again here: that function already enumerates
 * exactly what is narrowing the list and exactly the URL that removes each
 * one, and a second copy of that logic is a second place for the two to
 * disagree. Only the city pill breaks that pattern on purpose — see the
 * comment on it below.
 *
 * Only the filters this data can honestly answer, and no "Verified" pill: the
 * services API has no such filter, only the directory does.
 *
 * The option rows themselves are the `*Options` components below, shared with
 * `MobileServiceFilters` — one definition, two placements. A second copy for
 * the small screen is how the two stop offering the same filters, and how the
 * phone's badge once came to count a city its sheet had no group for.
 */
export function ServiceFilters({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");
  const cities = useServiceCities();
  const chips = browseFilterChips(current);

  const priceChip = chipFor(chips, "price");
  const whereChip = chipFor(chips, "locationType");
  const paymentChip = chipFor(chips, "paymentMode");
  const kindChip = chipFor(chips, "providerType");
  const languageChip = chipFor(chips, "language");
  const cityChip = chipFor(chips, "city");

  const priceLabel = t("filterPrice");
  const whereLabel = t("filterWhere");
  const paymentLabel = t("filterPayment");
  const kindLabel = t("filterProviderKind");
  const languageLabel = t("filterLanguage");
  const cityLabel = t("filterCity");

  return (
    <FilterBar>
      {/* The one group that is not a closed set, so the one that is not
          links — see `PriceRangeFilter`, which explains why a range has to
          be typed and submitted. */}
      <FilterPill
        label={priceLabel}
        active={priceChip ? t(priceChip.label.key, priceChip.label.values ?? {}) : undefined}
        clear={priceChip && <PillClear search={priceChip.next} label={priceLabel} />}
      >
        <PriceRangeFilter current={current} />
      </FilterPill>

      <FilterPill
        label={whereLabel}
        active={whereChip ? t(whereChip.label.key, whereChip.label.values ?? {}) : undefined}
        clear={whereChip && <PillClear search={whereChip.next} label={whereLabel} />}
      >
        <WhereOptions current={current} />
      </FilterPill>

      <FilterPill
        label={paymentLabel}
        active={paymentChip ? t(paymentChip.label.key, paymentChip.label.values ?? {}) : undefined}
        clear={paymentChip && <PillClear search={paymentChip.next} label={paymentLabel} />}
      >
        <PaymentOptions current={current} />
      </FilterPill>

      <FilterPill
        label={kindLabel}
        active={kindChip ? t(kindChip.label.key, kindChip.label.values ?? {}) : undefined}
        clear={kindChip && <PillClear search={kindChip.next} label={kindLabel} />}
      >
        <KindOptions current={current} />
      </FilterPill>

      <FilterPill
        label={languageLabel}
        active={languageChip ? t(languageChip.label.key, languageChip.label.values ?? {}) : undefined}
        clear={languageChip && <PillClear search={languageChip.next} label={languageLabel} />}
      >
        <LanguageOptions current={current} />
      </FilterPill>

      {/* Only when there is more than one place to choose between. A city
          filter offering a single city narrows nothing and takes a pill of
          the bar to say so. Its `active` is `current.city` itself, not
          `browseFilterChips`' "in {{city}}" chip text — that sentence reads
          right beside the results, but a pill that filled with the whole
          sentence instead of just the place would be the only one on the bar
          not simply naming what was picked. */}
      {cities.length > 1 && (
        <FilterPill
          label={cityLabel}
          active={current.city}
          clear={cityChip && <PillClear search={cityChip.next} label={cityLabel} />}
        >
          {/* The hint is the one thing the counts beside these cities cannot
              say for themselves. `?city=…` matches "this city OR remote" — a
              remote service has no geography to be excluded by — so every
              count carries the whole remote population, and "Beira 12" over a
              town with one business would otherwise read as a wrong number
              rather than as an honest one about a wider link. First line of
              the popover, above the cities it is about. */}
          <p className="type-caption pb-2 text-[var(--color-muted-foreground)]">
            {t("filterCityHint")}
          </p>
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
 * The successor to `MobileFilterBar`'s full-width bar, and the reason that
 * bar's spacer is gone: the capsule is narrow and centred rather than a strip
 * across the screen, so it never sits over the last tile or the pager.
 *
 * Two halves, because a control with one half is a button: the filters, with
 * how many are on, and the same `SortDropdown` the heading row carries — the
 * heading's copy is `hidden lg:inline-flex`, so a phone shows exactly one
 * sort. The sort's `onChoose` is built here rather than passed in because
 * this component takes the search and nothing else; it is the same three
 * lines `ServicesBrowsePage` writes for its own copy, and both go through
 * `browseSearch`, which is what keeps every other filter on the URL.
 *
 * The sheet holds the same option rows the pills hold, stacked into headed
 * groups instead of hidden behind six summaries — a sheet is a screen, not a
 * toolbar, and there is nothing here to save room for. They are literally the
 * same components: two copies is how a phone quietly stops offering a filter
 * its own badge is counting.
 *
 * Its footer button states the outcome — "Show 38 results" — rather than
 * saying "Apply", because a reader should know what they did before they
 * commit to it, not after.
 */
export function MobileServiceFilters({
  current,
  total,
}: {
  current: BrowseSearch;
  /** How many results the current search matched, for the sheet's own button. */
  total: number;
}) {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();
  const cities = useServiceCities();
  const [open, setOpen] = useState(false);
  const count = appliedCount(current);

  const sortOptions: ReadonlyArray<SortDropdownOption<BrowseSort>> = [
    { value: undefined, label: t("sortOption.default") },
    { value: "newest", label: t("sortOption.newest") },
    { value: "price", label: t("sortOption.price") },
  ];

  return (
    <>
      <FloatingControls>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={floatingControlClass()}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {t("filtersTitle")}
          {/* Beside the word rather than in a badge on top of it: the capsule
              is one line of text, and a counter bubble on a 44px control is a
              second thing to aim at. */}
          {count > 0 && ` · ${String(count)}`}
        </button>

        <SortDropdown
          active={current.sort}
          options={sortOptions}
          sortLabel={t("sortTrigger")}
          triggerClassName={floatingControlClass()}
          onChoose={(value) =>
            void navigate({
              to: "/services",
              search: browseSearch(current, { sort: value, offset: undefined }),
            })
          }
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
        <SheetGroup label={t("filterPrice")}>
          <PriceRangeFilter current={current} />
        </SheetGroup>

        <SheetGroup label={t("filterWhere")}>
          <WhereOptions current={current} />
        </SheetGroup>

        <SheetGroup label={t("filterPayment")}>
          <PaymentOptions current={current} />
        </SheetGroup>

        <SheetGroup label={t("filterProviderKind")}>
          <KindOptions current={current} />
        </SheetGroup>

        <SheetGroup label={t("filterLanguage")} hint={t("filterLanguageHint")}>
          <LanguageOptions current={current} />
        </SheetGroup>

        {cities.length > 1 && (
          <SheetGroup label={t("filterCity")} hint={t("filterCityHint")}>
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
 * A heading and its rows, not a `<details>`: the pills collapse because six
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
      {hint && (
        <p className="type-caption mt-2 text-[var(--color-muted-foreground)]">{hint}</p>
      )}
      <div className="mt-3 grid">{children}</div>
    </section>
  );
}

function WhereOptions({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");
  return (
    <>
      {LOCATION_TYPES.map((v) => (
        <FacetOption
          key={v}
          label={t(`filterWhereOption.${v}`)}
          active={current.locationType === v}
          value={v}
          toSearch={(locationType) => browseSearch(current, { locationType, offset: undefined })}
        />
      ))}
    </>
  );
}

function PaymentOptions({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");
  return (
    <>
      {PAYMENT_MODES.map((v) => (
        <FacetOption
          key={v}
          label={t(`filterPaymentOption.${v}`)}
          active={current.paymentMode === v}
          value={v}
          toSearch={(paymentMode) => browseSearch(current, { paymentMode, offset: undefined })}
        />
      ))}
    </>
  );
}

function KindOptions({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");
  return (
    <>
      {PROVIDER_KINDS.map((v) => (
        <FacetOption
          key={v}
          label={t(`filterProviderKindOption.${v}`)}
          active={current.providerType === v}
          value={v}
          toSearch={(providerType) => browseSearch(current, { providerType, offset: undefined })}
        />
      ))}
    </>
  );
}

function LanguageOptions({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");
  return (
    <>
      {LANGUAGES.map((v) => (
        <FacetOption
          key={v}
          label={t(`filterLanguageOption.${v}`, { defaultValue: v })}
          active={current.language === v}
          value={v}
          toSearch={(language) => browseSearch(current, { language, offset: undefined })}
        />
      ))}
    </>
  );
}

function CityOptions({ current }: { current: BrowseSearch }) {
  const cities = useServiceCities();
  return (
    <>
      {cities.map((c) => (
        <FacetOption
          key={c.city}
          label={c.city}
          active={current.city === c.city}
          count={c.count}
          toSearch={(city) => browseSearch(current, { city, offset: undefined })}
          value={c.city}
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
 * keeps "clicking the active one clears it" written once for six groups.
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
  toSearch: (value: string | undefined) => BrowseSearch;
}) {
  return (
    <Link
      to="/services"
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
