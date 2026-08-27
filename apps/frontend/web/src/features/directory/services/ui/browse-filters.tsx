import { useState, type ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Building2, Languages, MapPin, SlidersHorizontal, Tag, Wallet } from "lucide-react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  cn,
} from "@ntizo/frontend-ui";
import {
  browseSearch,
  type BrowseSearch,
} from "@/features/directory/services/domain/browse-search";
import { PriceRangeFilter } from "@/features/directory/services/ui/price-range-filter";
import { SearchBox } from "@/features/directory/services/ui/search-box";
import { FilterPanelCard, FilterSection } from "@/shared/components/filter-panel";

/**
 * The closed sets the four link groups offer.
 *
 * Imported from `service-facets.tsx` rather than spelled a second time here:
 * two copies of "these are the four places a service can happen" is two places
 * for a fifth one to be missed. That file is the one that outlives this one —
 * this panel is the phone's until Task 21 moves it onto the same groups.
 */
import {
  LANGUAGES,
  LOCATION_TYPES,
  PAYMENT_MODES,
  PROVIDER_KINDS,
} from "@/features/directory/services/ui/service-facets";

/**
 * The browse's sidebar: the search box, then the filters.
 *
 * The search sits above the filters, and both sit in the same column, because
 * they do the same kind of work — narrowing a set the category band has
 * already chosen. Search first because it is the one a reader arrives knowing
 * they want.
 *
 * The filters are links, not form controls: a filtered list is a URL somebody
 * can send, and the back button should undo a filter. That also keeps them
 * usable before any JavaScript has run, which matters on a page built to be
 * crawled. Each link is built by `browseSearch` so it carries the search term
 * and the sort rather than quietly dropping whatever it does not know about.
 *
 * Only the filters this data can honestly answer. Price runs on the *cheapest*
 * active option rather than the provider's chosen default — one number for
 * both the bound and the "from" the card prints, so a service can never be
 * hidden by a range it visibly satisfies.
 *
 * On a phone this same panel is the body of a sheet instead of a column; see
 * `MobileFilterBar`. One definition, two placements — a second copy for the
 * small screen is how the two stop offering the same filters.
 */
export function BrowseFilters({ current }: { current: BrowseSearch }) {
  return (
    <aside className="hidden content-start gap-3 lg:sticky lg:top-4 lg:grid">
      <FilterPanel current={current} />
    </aside>
  );
}

/** The filters themselves, without the column or the sheet around them. */
function FilterPanel({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");

  return (
    <>
      <SearchBox current={current} />

      <FilterPanelCard title={t("filtersTitle")}>
      <FilterGroup
        icon={MapPin}
        label={t("filterWhere")}
        options={LOCATION_TYPES}
        selected={current.locationType}
        optionLabel={(v) => t(`filterWhereOption.${v}`)}
        toSearch={(v) => browseSearch(current, { locationType: v })}
      />

      <FilterGroup
        icon={Wallet}
        label={t("filterPayment")}
        options={PAYMENT_MODES}
        selected={current.paymentMode}
        optionLabel={(v) => t(`filterPaymentOption.${v}`)}
        toSearch={(v) => browseSearch(current, { paymentMode: v })}
      />

      <FilterGroup
        icon={Building2}
        label={t("filterProviderKind")}
        options={PROVIDER_KINDS}
        selected={current.providerType}
        optionLabel={(v) => t(`filterProviderKindOption.${v}`)}
        toSearch={(v) => browseSearch(current, { providerType: v })}
      />

      <FilterGroup
        icon={Languages}
        label={t("filterLanguage")}
        hint={t("filterLanguageHint")}
        options={LANGUAGES}
        selected={current.language}
        optionLabel={(v) => t(`filterLanguageOption.${v}`, { defaultValue: v })}
        toSearch={(v) => browseSearch(current, { language: v })}
      />

      <FilterSection icon={Tag} label={t("filterPrice")}>
        <PriceRangeFilter current={current} />
      </FilterSection>
      </FilterPanelCard>
    </>
  );
}

/**
 * How many narrowings are on, for the button that opens the sheet.
 *
 * The category band is excluded: on a phone it is still on screen above the
 * results, so counting it here would show a badge for something the reader can
 * already see and clear without opening anything.
 */
export function activeFilterCount(current: BrowseSearch): number {
  return [
    current.locationType,
    current.paymentMode,
    current.providerType,
    current.language,
    current.city,
    current.q,
    // A price range is one filter however many of its two boxes are filled:
    // counting the bounds separately would show "2" for a single range.
    current.minPrice != null || current.maxPrice != null ? "price" : undefined,
  ].filter((v) => v != null).length;
}

/**
 * The filters on a phone: a bar at the bottom, opening a sheet from it.
 *
 * Fixed to the bottom rather than sitting above the results, because the
 * sidebar's position on a narrow screen is "in front of everything the reader
 * came for" — a column of chips between them and the first card is a page they
 * scroll past every time. At the bottom it is reachable with a thumb at any
 * scroll position, and costs nothing until it is wanted.
 */
export function MobileFilterBar({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(current);

  return (
    <>
      {/* Reserves the height the fixed bar covers, so the last card and the
          paging links are not sitting underneath it. */}
      <div className="h-20 lg:hidden" aria-hidden="true" />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-background)] p-3 lg:hidden">
        <Button
          type="button"
          variant="outline"
          className="w-full"
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
          <SheetHeader>
            <SheetTitle>{t("filtersTitle")}</SheetTitle>
          </SheetHeader>
          {/* Closes on any choice: every control in here navigates, and a
              sheet left open over the results it just changed hides the
              answer to the question the reader asked. */}
          {/* The panel's own heading is dropped here — the sheet's title
              already says "Filters", and two of them one above the other read
              as a mistake rather than as structure. */}
          <div className="mt-4 grid gap-5 [&_h2]:hidden" onClick={() => setOpen(false)}>
            <FilterPanel current={current} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * One heading and its row of chips.
 *
 * Extracted when the sidebar grew its second and third group: the clearing
 * behaviour, the active styling and the link construction were about to be
 * written three times, and three copies of "clicking the active one clears
 * it" is three places for it to stop being true.
 */
function FilterGroup({
  icon: Icon,
  label,
  hint,
  options,
  selected,
  optionLabel,
  toSearch,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  /** A line under the heading, where the label alone would overclaim. */
  hint?: string;
  options: readonly string[];
  selected: string | undefined;
  optionLabel: (value: string) => string;
  /** The search object for choosing this value, or `undefined` to clear it. */
  toSearch: (value: string | undefined) => BrowseSearch;
}) {
  return (
    <FilterSection icon={Icon} label={label} {...(hint ? { hint } : {})}>
      <div className="flex flex-wrap gap-2">
        {options.map((value) => {
          const active = selected === value;
          return (
            <Link
              key={value}
              to="/services"
              // Clicking the active one clears it: a filter you set by
              // clicking should come off the same way, without hunting for
              // a separate "clear" the sidebar would otherwise need.
              search={toSearch(active ? undefined : value)}
              aria-pressed={active}
              className={cn(
                "type-caption rounded-full border px-3 py-1.5 transition-colors",
                active
                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] font-semibold text-[var(--color-primary)]"
                  // A surface of its own: unfilled, a chip on the panel's tint
                  // is an outline drawn on colour rather than a control.
                  : "border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-muted-foreground)]",
              )}
            >
              {optionLabel(value)}
            </Link>
          );
        })}
      </div>
    </FilterSection>
  );
}
