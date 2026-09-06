import { X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LOCALES } from "@ntizo/shared";
import { FilterBar, FilterPill } from "@/shared/components/browse/filter-pill";
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
 * because the rail above the results is still showing it and clearing
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
        {LOCATION_TYPES.map((v) => (
          <FacetOption
            key={v}
            label={t(`filterWhereOption.${v}`)}
            active={current.locationType === v}
            value={v}
            toSearch={(locationType) => browseSearch(current, { locationType, offset: undefined })}
          />
        ))}
      </FilterPill>

      <FilterPill
        label={paymentLabel}
        active={paymentChip ? t(paymentChip.label.key, paymentChip.label.values ?? {}) : undefined}
        clear={paymentChip && <PillClear search={paymentChip.next} label={paymentLabel} />}
      >
        {PAYMENT_MODES.map((v) => (
          <FacetOption
            key={v}
            label={t(`filterPaymentOption.${v}`)}
            active={current.paymentMode === v}
            value={v}
            toSearch={(paymentMode) => browseSearch(current, { paymentMode, offset: undefined })}
          />
        ))}
      </FilterPill>

      <FilterPill
        label={kindLabel}
        active={kindChip ? t(kindChip.label.key, kindChip.label.values ?? {}) : undefined}
        clear={kindChip && <PillClear search={kindChip.next} label={kindLabel} />}
      >
        {PROVIDER_KINDS.map((v) => (
          <FacetOption
            key={v}
            label={t(`filterProviderKindOption.${v}`)}
            active={current.providerType === v}
            value={v}
            toSearch={(providerType) => browseSearch(current, { providerType, offset: undefined })}
          />
        ))}
      </FilterPill>

      <FilterPill
        label={languageLabel}
        active={languageChip ? t(languageChip.label.key, languageChip.label.values ?? {}) : undefined}
        clear={languageChip && <PillClear search={languageChip.next} label={languageLabel} />}
      >
        {LANGUAGES.map((v) => (
          <FacetOption
            key={v}
            label={t(`filterLanguageOption.${v}`, { defaultValue: v })}
            active={current.language === v}
            value={v}
            toSearch={(language) => browseSearch(current, { language, offset: undefined })}
          />
        ))}
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
        </FilterPill>
      )}

      {/* Nothing to clear is not a disabled link — it is no link. Gated on
          the chips other than `q`: the term is the header search pill's to
          clear, not this bar's, so a search with only a typed term on gets
          no clear-all here. */}
      {chips.some((c) => c.key !== "q") && (
        <Link
          to="/services"
          activeOptions={EXACT_MATCH}
          search={clearedBrowseSearch(current)}
          className="type-caption font-semibold text-[var(--color-headline)] underline underline-offset-[3px] hover:opacity-80"
        >
          {t("filtersClearAll")}
        </Link>
      )}
    </FilterBar>
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
