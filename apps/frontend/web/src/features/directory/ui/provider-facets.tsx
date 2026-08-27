import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Building2, MapPin, SlidersHorizontal, Star, Tag } from "lucide-react";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle } from "@ntizo/frontend-ui";
import {
  FacetBox,
  FacetCount,
  FacetGroup,
  FacetPanel,
  facetOptionClass,
} from "@/shared/components/browse/facet-panel";
import { EXACT_MATCH } from "@/shared/components/browse/active-match";
import {
  activeDirectoryFilterCount,
  directorySearch,
  PROVIDER_KINDS,
  RATING_THRESHOLDS,
  type DirectorySearch,
} from "@/features/directory/domain/directory-search";
import { directoryFilterChips } from "@/features/directory/domain/directory-chips";
import { useProviderCities } from "@/features/directory/viewmodel/use-directory";
import { DirectoryPriceFilter } from "@/features/directory/ui/directory-price-filter";

/**
 * Everything the sidebar can narrow, taken off at once.
 *
 * Exactly the set `directoryFilterChips` lists, and for the same reasons: the
 * **category is kept**, because the rail above the results is still showing it
 * and clearing something visible from a control somewhere else reads as a bug;
 * the **sort is kept**, because an order is not a narrowing and clearing
 * filters should not also reorder what is left.
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
    q: undefined,
    offset: undefined,
  });
}

/**
 * The directory's sidebar, on the shared `FacetPanel`.
 *
 * The successor to `DirectoryFilters`, the twin of `ServiceFacets`, and the
 * same contract: every option is a **link**, never a form control. A filtered
 * list is a URL somebody can send, the back button undoes a filter, and the
 * whole thing works before any JavaScript has run — which matters on a page
 * built to be crawled. Each link is built by `directorySearch` so it carries
 * the search term, the category and the sort rather than quietly dropping
 * whatever it does not itself know about.
 *
 * Five groups, and only the filters this data can honestly answer. The price
 * bound runs on the business's cheapest published option, which is the same
 * number its card prints as "from" — so a business can never be hidden by a
 * range it visibly satisfies.
 *
 * No card around it any more, and no search box inside it. The panel's tint
 * was there because the filters floated on a white page with nothing to sit
 * on; the page is tinted now, so a second tinted panel would be a surface
 * competing with the hero. The search moved into the hero's own card, which is
 * where somebody arriving looks for it.
 */
export function ProviderFacets({ current }: { current: DirectorySearch }) {
  return (
    <aside className="hidden lg:sticky lg:top-5 lg:block">
      <FacetGroups current={current} />
    </aside>
  );
}

/**
 * The groups themselves, without the column or the sheet around them.
 *
 * One definition, two placements — a second copy for the small screen is how
 * the two stop offering the same filters.
 */
function FacetGroups({ current }: { current: DirectorySearch }) {
  const { t, i18n } = useTranslation("directory");
  const cities = useProviderCities();
  const cleared = clearedDirectorySearch(current);
  // Nothing to clear is not a disabled link — it is no link. Asked of
  // `directoryFilterChips` rather than counted again here, because that
  // function already enumerates exactly the set `clearedDirectorySearch`
  // drops; a second list is a second place for the two to disagree.
  const isNarrowed = directoryFilterChips(current).length > 0;
  // The threshold as this reader writes a decimal. Spelling it "4,5" by
  // replacing the point was right for one language and wrong for the other
  // seven the platform ships.
  const score = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
    minimumFractionDigits: 1,
  });

  return (
    <FacetPanel
      title={t("filtersTitle")}
      {...(isNarrowed
        ? {
            clear: (
              <Link
                to="/providers"
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
              value={c.city}
              toSearch={(city) => directorySearch(current, { city, offset: undefined })}
            />
          ))}
        </FacetGroup>
      )}

      <FacetGroup icon={Building2} label={t("filterProviderKind")}>
        {PROVIDER_KINDS.map((v) => (
          <FacetOption
            key={v}
            label={t(`filterProviderKindOption.${v}`)}
            active={current.providerType === v}
            value={v}
            toSearch={(providerType) => directorySearch(current, { providerType, offset: undefined })}
          />
        ))}
      </FacetGroup>

      <FacetGroup icon={Star} label={t("filterRating")} hint={t("filterRatingHint")}>
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
      </FacetGroup>

      <FacetGroup
        icon={BadgeCheck}
        label={t("filterVerification")}
        hint={t("filterVerificationHint")}
      >
        <FacetOption
          label={t("filterVerifiedOnly")}
          active={current.verified === true}
          value="verified"
          // `verified: false` is never written — see `directorySearch`, which
          // drops it. Turning the filter off is turning the parameter off.
          toSearch={(v) => directorySearch(current, { verified: v != null, offset: undefined })}
        />
      </FacetGroup>

      {/* The one group that is not a closed set, so the one that is not links
          — see `DirectoryPriceFilter`, which explains why a range has to be
          typed and submitted. */}
      <FacetGroup icon={Tag} label={t("filterPrice")}>
        <DirectoryPriceFilter current={current} />
      </FacetGroup>
    </FacetPanel>
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

/**
 * The filters on a phone: a bar at the bottom, opening a sheet from it.
 *
 * Fixed to the bottom rather than sitting above the results, because the
 * sidebar's position on a narrow screen is "in front of everything the reader
 * came for" — a column of filters between them and the first card is a page
 * they scroll past every time. At the bottom it is reachable with a thumb at
 * any scroll position, and costs nothing until it is wanted.
 *
 * It lives here rather than beside the panel it used to wrap: `DirectoryFilters`
 * is gone, and this renders the same `FacetGroups` the sidebar does, so the two
 * placements cannot drift apart.
 */
export function MobileDirectoryFilterBar({ current }: { current: DirectorySearch }) {
  const { t } = useTranslation("directory");
  const [open, setOpen] = useState(false);
  const count = activeDirectoryFilterCount(current);

  return (
    <>
      {/* Reserves the height the fixed bar covers, so the last card and the
          pager are not sitting underneath it. */}
      <div className="h-20 lg:hidden" aria-hidden="true" />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-background)] p-3 lg:hidden">
        <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {t("filtersTitle")}
          {count > 0 && (
            <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-primary)] px-1.5 text-[11px] font-semibold text-[var(--color-primary-foreground)]">
              {count}
            </span>
          )}
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85svh] overflow-y-auto rounded-t-[var(--radius-card)] p-5"
        >
          <SheetHeader>
            <SheetTitle>{t("filtersTitle")}</SheetTitle>
          </SheetHeader>
          {/* Closes on any choice: every control in here navigates, and a sheet
              left open over the results it just changed hides the answer to the
              question the reader asked. */}
          <div className="mt-4" onClick={() => setOpen(false)}>
            {/* The panel's own heading is dropped here — the sheet's title
                already says "Filters", and two of them one above the other read
                as a mistake rather than as structure. */}
            <div className="[&_h2]:hidden">
              <FacetGroups current={current} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
