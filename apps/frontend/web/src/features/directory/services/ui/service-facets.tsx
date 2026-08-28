import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Building2, Languages, MapPin, SlidersHorizontal, Tag, Wallet } from "lucide-react";
import { LOCALES } from "@ntizo/shared";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle } from "@ntizo/frontend-ui";
import {
  FacetBox,
  FacetCount,
  FacetGroup,
  FacetPanel,
  closeOnChoice,
  facetOptionClass,
} from "@/shared/components/browse/facet-panel";
import { EXACT_MATCH } from "@/shared/components/browse/active-match";
import {
  activeFilterCount,
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
 * The successor to `BrowseFilters`, the twin of `ProviderFacets`, and the same
 * contract: every option is a **link**, never a form control. A filtered list
 * is a URL somebody can send, the back button undoes a filter, and the whole
 * thing works before any JavaScript has run — which matters on a page built to
 * be crawled. Each link is built by `browseSearch` so it carries the search
 * term, the category and the sort rather than quietly dropping whatever it does
 * not itself know about.
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
 */
export function ServiceFacets({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");

  return (
    <aside className="hidden lg:sticky lg:top-5 lg:block">
      <FacetPanel title={t("filtersTitle")} clear={<ClearAll current={current} />}>
        <FacetGroups current={current} />
      </FacetPanel>
    </aside>
  );
}

/**
 * The groups themselves, without the column or the sheet around them.
 *
 * One definition, two placements — a second copy for the small screen is how
 * the two stop offering the same filters, and how the phone's badge came to
 * count a city the sheet had no group for.
 */
function FacetGroups({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");
  const cities = useServiceCities();

  return (
    <>
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
            toSearch={(locationType) => browseSearch(current, { locationType, offset: undefined })}
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
            toSearch={(providerType) => browseSearch(current, { providerType, offset: undefined })}
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
    </>
  );
}

/**
 * The link that takes every narrowing off at once, or nothing at all.
 *
 * Nothing to clear is not a disabled link — it is no link. Asked of
 * `browseFilterChips` rather than counted again here, because that function
 * already enumerates exactly the set `clearedBrowseSearch` drops; a second list
 * is a second place for the two to disagree.
 *
 * `onNavigate` is the sheet's way of closing behind itself. The sidebar passes
 * nothing, because there is nothing to close.
 */
function ClearAll({ current, onNavigate }: { current: BrowseSearch; onNavigate?: () => void }) {
  const { t } = useTranslation("directory");
  if (browseFilterChips(current).length === 0) return null;

  return (
    <Link
      to="/services"
      activeOptions={EXACT_MATCH}
      search={clearedBrowseSearch(current)}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className="type-caption font-semibold text-[var(--color-primary)] hover:underline"
    >
      {t("filtersClearAll")}
    </Link>
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

/**
 * The filters on a phone: a bar at the bottom, opening a sheet from it.
 *
 * Fixed to the bottom rather than sitting above the results, because the
 * sidebar's position on a narrow screen is "in front of everything the reader
 * came for" — a column of filters between them and the first card is a page
 * they scroll past every time. At the bottom it is reachable with a thumb at
 * any scroll position, and costs nothing until it is wanted.
 *
 * It renders the same `FacetGroups` the sidebar does, so the two placements
 * cannot drift apart — which they had: the badge counted a city the sheet had
 * no group for, so it could read 2 over a sheet offering one control the reader
 * could act on.
 *
 * The twin of `MobileDirectoryFilterBar`, down to the shadow and the border.
 */
export function MobileFilterBar({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const count = activeFilterCount(current);

  return (
    <>
      {/* Reserves the height the fixed bar covers, so the last card and the
          pager are not sitting underneath it. */}
      <div className="h-20 lg:hidden" aria-hidden="true" />

      {/* Above the customer bottom bar, not under it. `MobileNav` is `fixed
          bottom-0 z-40` below `md`, so a bar of its own at `bottom-0` was
          painted over completely and the filters could not be opened at all on
          a phone — badge, sheet and every group in it, unreachable. The offset
          carries the safe-area inset because the nav does too; without it the
          two overlap by the height of the iOS home indicator. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-[var(--color-border)] bg-[var(--color-background)] p-3 shadow-[var(--shadow-float)] md:bottom-0 lg:hidden">
        <Button
          type="button"
          variant="outline"
          className="font-rounded h-12 w-full border-[var(--color-border-strong)]"
          onClick={() => setOpen(true)}
        >
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
          {/* A dialog of its own, like `MobileSearchSheet`'s: the `Sheet`
              primitive draws a fixed div and nothing else, so without this a
              screen reader is handed the groups with no boundary around them
              and no name saying what they are.

              No `aria-modal`, for the reason that component spells out: the
              role describes, `aria-modal` asserts the rest of the page is
              inert, and this primitive traps no focus and handles no Escape.
              See follow-up #78. */}
          <div role="dialog" aria-labelledby={titleId}>
            {/* `FacetPanel`'s own heading row is not rendered in here — the
                sheet's title already says "Filters", and two of them one above
                the other read as a mistake rather than as structure. The
                clear-all comes with it, into this row, rather than being left
                underneath on its own with nothing beside it. */}
            <SheetHeader className="flex-row items-baseline justify-between gap-3">
              <SheetTitle id={titleId}>{t("filtersTitle")}</SheetTitle>
              <ClearAll current={current} onNavigate={() => setOpen(false)} />
            </SheetHeader>

            <div className="mt-4" onClick={closeOnChoice(() => setOpen(false))}>
              <FacetGroups current={current} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
