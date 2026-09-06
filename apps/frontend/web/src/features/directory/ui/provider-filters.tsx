import { X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FilterBar, FilterPill } from "@/shared/components/browse/filter-pill";
import { FacetBox, FacetCount, facetOptionClass } from "@/shared/components/browse/facet-panel";
import { EXACT_MATCH } from "@/shared/components/browse/active-match";
import {
  directorySearch,
  PROVIDER_KINDS,
  RATING_THRESHOLDS,
  type DirectorySearch,
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
 * number its card prints as "from" — so a business can never be hidden by a
 * range it visibly satisfies.
 */
export function ProviderFilters({ current }: { current: DirectorySearch }) {
  const { t, i18n } = useTranslation("directory");
  const cities = useProviderCities();
  const chips = directoryFilterChips(current);
  // The threshold as this reader writes a decimal. Spelling it "4,5" by
  // replacing the point was right for one language and wrong for the other
  // seven the platform ships.
  const score = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
    minimumFractionDigits: 1,
  });

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
        {RATING_THRESHOLDS.map((v) => (
          <FacetOption
            key={v}
            label={t("filterRatingOption", { score: score.format(v) })}
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
        {PROVIDER_KINDS.map((v) => (
          <FacetOption
            key={v}
            label={t(`filterProviderKindOption.${v}`)}
            active={current.providerType === v}
            value={v}
            toSearch={(providerType) => directorySearch(current, { providerType, offset: undefined })}
          />
        ))}
      </FilterPill>

      {/* A single-option pill: there is nothing to choose between, only to
          switch on or off, so the group is one row rather than a list. */}
      <FilterPill
        label={verifiedLabel}
        active={verifiedChip ? t(verifiedChip.label.key, verifiedChip.label.values ?? {}) : undefined}
        clear={verifiedChip && <PillClear search={verifiedChip.next} label={verifiedLabel} />}
      >
        <FacetOption
          label={t("filterVerifiedOnly")}
          active={current.verified === true}
          value="verified"
          // `verified: false` is never written — see `directorySearch`, which
          // drops it. Turning the filter off is turning the parameter off.
          toSearch={(v) => directorySearch(current, { verified: v != null, offset: undefined })}
        />
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
        </FilterPill>
      )}

      {/* Nothing to clear is not a disabled link — it is no link. Gated on
          the chips other than `q`: the term is the header search pill's to
          clear, not this bar's, so a search with only a typed term on gets
          no clear-all here. */}
      {chips.some((c) => c.key !== "q") && (
        <Link
          to="/providers"
          activeOptions={EXACT_MATCH}
          search={clearedDirectorySearch(current)}
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
