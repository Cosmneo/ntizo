import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Building2, Languages, MapPin, Tag, Wallet } from "lucide-react";
import { LOCALES } from "@ntizo/shared";
import {
  FacetBox,
  FacetCount,
  FacetGroup,
  FacetPanel,
  facetOptionClass,
} from "@/shared/components/browse/facet-panel";
import { EXACT_MATCH } from "@/shared/components/browse/active-match";
import {
  browseSearch,
  type BrowseSearch,
} from "@/features/directory/services/domain/browse-search";
import { browseFilterChips } from "@/features/directory/services/domain/browse-chips";
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
 * Everything the sidebar can narrow, taken off at once.
 *
 * Exactly the set `browseFilterChips` lists, and for the same reasons: the
 * **category is kept**, because the rail above the results is still showing it
 * and clearing something visible from a control somewhere else reads as a bug;
 * the **sort is kept**, because an order is not a narrowing and clearing
 * filters should not also reorder what is left.
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
    q: undefined,
    offset: undefined,
  });
}

/**
 * The browse's sidebar, on the shared `FacetPanel`.
 *
 * The successor to `BrowseFilters`, and the same contract: every option is a
 * **link**, never a form control. A filtered list is a URL somebody can send,
 * the back button undoes a filter, and the whole thing works before any
 * JavaScript has run — which matters on a page built to be crawled. Each link
 * is built by `browseSearch` so it carries the search term, the category and
 * the sort rather than quietly dropping whatever it does not itself know
 * about.
 *
 * Only the filters this data can honestly answer. Price runs on the *cheapest*
 * active option rather than the provider's chosen default — one number for
 * both the bound and the "from" the card prints, so a service can never be
 * hidden by a range it visibly satisfies.
 *
 * No card around it any more, and no search box inside it. The panel's tint
 * was there because the filters floated on a white page with nothing to sit
 * on; the page is tinted now, so a second tinted panel would be a surface
 * competing with the hero. The search moved into the hero's own card, which is
 * where somebody arriving looks for it.
 *
 * On a phone this column is hidden and `MobileFilterBar` still carries the old
 * panel behind a sheet; Task 21 moves it onto these groups.
 */
export function ServiceFacets({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");
  const cities = useServiceCities();
  const cleared = clearedBrowseSearch(current);
  // Nothing to clear is not a disabled link — it is no link. Asked of
  // `browseFilterChips` rather than counted again here, because that function
  // already enumerates exactly the set `clearedBrowseSearch` drops; a second
  // list is a second place for the two to disagree.
  const isNarrowed = browseFilterChips(current).length > 0;

  return (
    <aside className="hidden lg:sticky lg:top-5 lg:block">
      <FacetPanel
        title={t("filtersTitle")}
        {...(isNarrowed
          ? {
              clear: (
                <Link
                  to="/services"
                  activeOptions={EXACT_MATCH}
                  search={cleared}
                  className="type-caption font-semibold text-[var(--color-primary)] hover:underline"
                >
                  {t("filtersClearAll")}
                </Link>
              ),
            }
          : {})}
      >
        {/* Only when there is more than one place to choose between. A city
            filter offering a single city narrows nothing and takes a group of
            the panel to say so. */}
        {cities.length > 1 && (
          <FacetGroup icon={MapPin} label={t("filterCity")}>
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
          </FacetGroup>
        )}

        <FacetGroup icon={MapPin} label={t("filterWhere")}>
          {LOCATION_TYPES.map((v) => (
            <FacetOption
              key={v}
              label={t(`filterWhereOption.${v}`)}
              active={current.locationType === v}
              value={v}
              toSearch={(locationType) =>
                browseSearch(current, { locationType, offset: undefined })
              }
            />
          ))}
        </FacetGroup>

        <FacetGroup icon={Wallet} label={t("filterPayment")}>
          {PAYMENT_MODES.map((v) => (
            <FacetOption
              key={v}
              label={t(`filterPaymentOption.${v}`)}
              active={current.paymentMode === v}
              value={v}
              toSearch={(paymentMode) => browseSearch(current, { paymentMode, offset: undefined })}
            />
          ))}
        </FacetGroup>

        <FacetGroup icon={Building2} label={t("filterProviderKind")}>
          {PROVIDER_KINDS.map((v) => (
            <FacetOption
              key={v}
              label={t(`filterProviderKindOption.${v}`)}
              active={current.providerType === v}
              value={v}
              toSearch={(providerType) =>
                browseSearch(current, { providerType, offset: undefined })
              }
            />
          ))}
        </FacetGroup>

        <FacetGroup icon={Languages} label={t("filterLanguage")} hint={t("filterLanguageHint")}>
          {LANGUAGES.map((v) => (
            <FacetOption
              key={v}
              label={t(`filterLanguageOption.${v}`, { defaultValue: v })}
              active={current.language === v}
              value={v}
              toSearch={(language) => browseSearch(current, { language, offset: undefined })}
            />
          ))}
        </FacetGroup>

        {/* The one group that is not a closed set, so the one that is not
            links — see `PriceRangeFilter`, which explains why a range has to
            be typed and submitted. */}
        <FacetGroup icon={Tag} label={t("filterPrice")}>
          <PriceRangeFilter current={current} />
        </FacetGroup>
      </FacetPanel>
    </aside>
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
      // sidebar would otherwise need.
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
