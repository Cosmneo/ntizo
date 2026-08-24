import { useState, type ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Building2, MapPin, SlidersHorizontal, Star, Tag } from "lucide-react";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, cn } from "@ntizo/frontend-ui";
import {
  activeDirectoryFilterCount,
  directorySearch,
  PROVIDER_KINDS,
  RATING_THRESHOLDS,
  type DirectorySearch,
} from "@/features/directory/domain/directory-search";
import { useProviderCities } from "@/features/directory/viewmodel/use-directory";
import { DirectoryPriceFilter } from "@/features/directory/ui/directory-price-filter";
import { DirectorySearchBox } from "@/features/directory/ui/directory-search-box";
import { FilterPanelCard, FilterSection } from "@/shared/components/filter-panel";

/**
 * The directory's sidebar: the search box, then the filters.
 *
 * The same shape the services browse uses, and deliberately so — these are the
 * two browse surfaces of the platform, and a reader who learns one has learned
 * the other. The search sits above the filters because it is the one somebody
 * arrives already knowing they want.
 *
 * The filters are links, not form controls: a filtered list is a URL somebody
 * can send, the back button should undo a filter, and the whole thing keeps
 * working before any JavaScript has run — which matters on a page built to be
 * crawled. Each link is built by `directorySearch`, so it carries the search
 * term and the sort rather than quietly dropping whatever it does not know.
 *
 * Only the filters this data can honestly answer. The cities come from the
 * providers that exist rather than from the reference table, so the panel never
 * offers a place with nothing in it.
 *
 * On a phone this same panel is the body of a sheet instead of a column; see
 * `MobileDirectoryFilterBar`. One definition, two placements — a second copy
 * for the small screen is how the two stop offering the same filters.
 */
export function DirectoryFilters({ current }: { current: DirectorySearch }) {
  return (
    <aside className="hidden content-start gap-3 lg:sticky lg:top-4 lg:grid">
      <FilterPanel current={current} />
    </aside>
  );
}

/** The filters themselves, without the column or the sheet around them. */
function FilterPanel({ current }: { current: DirectorySearch }) {
  const { t } = useTranslation("directory");
  const cities = useProviderCities();

  return (
    <>
      <DirectorySearchBox current={current} />

      <FilterPanelCard title={t("filtersTitle")}>
      {/* Only when there is more than one place to choose between. A city
          filter offering a single city narrows nothing and takes a row of the
          panel to say so. */}
      {cities.length > 1 && (
        <FilterGroup
          icon={MapPin}
          label={t("filterCity")}
          options={cities.map((c) => c.city)}
          selected={current.city}
          optionLabel={(city) => city}
          optionSuffix={(city) => cities.find((c) => c.city === city)?.count}
          toSearch={(city) => directorySearch(current, { city, offset: undefined })}
        />
      )}

      <FilterGroup
        icon={Building2}
        label={t("filterProviderKind")}
        options={PROVIDER_KINDS}
        selected={current.providerType}
        optionLabel={(v) => t(`filterProviderKindOption.${v}`)}
        toSearch={(providerType) => directorySearch(current, { providerType, offset: undefined })}
      />

      <FilterGroup
        icon={Star}
        label={t("filterRating")}
        hint={t("filterRatingHint")}
        options={RATING_THRESHOLDS.map(String)}
        selected={current.minRating == null ? undefined : String(current.minRating)}
        optionLabel={(v) => t("filterRatingOption", { score: v.replace(".", ",") })}
        toSearch={(v) =>
          directorySearch(current, {
            minRating: v == null ? undefined : (Number(v) as (typeof RATING_THRESHOLDS)[number]),
            offset: undefined,
          })
        }
      />

      <FilterGroup
        icon={BadgeCheck}
        label={t("filterVerification")}
        hint={t("filterVerificationHint")}
        options={["verified"]}
        selected={current.verified ? "verified" : undefined}
        optionLabel={() => t("filterVerifiedOnly")}
        toSearch={(v) => directorySearch(current, { verified: v != null, offset: undefined })}
      />

      <FilterSection icon={Tag} label={t("filterPrice")}>
        <DirectoryPriceFilter current={current} />
      </FilterSection>
      </FilterPanelCard>
    </>
  );
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
export function MobileDirectoryFilterBar({ current }: { current: DirectorySearch }) {
  const { t } = useTranslation("directory");
  const [open, setOpen] = useState(false);
  const count = activeDirectoryFilterCount(current);

  return (
    <>
      {/* Reserves the height the fixed bar covers, so the last card and the
          paging link are not sitting underneath it. */}
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
          <div className="mt-4 grid gap-5" onClick={() => setOpen(false)}>
            {/* The panel's own heading is dropped here — the sheet's title
                already says "Filters", and two of them one above the other read
                as a mistake rather than as structure. A descendant selector,
                not a child one: the heading lives inside the panel card now. */}
            <div className="[&_h2]:hidden">
              <FilterPanel current={current} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * One heading and its row of chips.
 *
 * The sibling of the services browse's own `FilterGroup`, kept separate rather
 * than shared: that one builds `Link`s to `/services` with a `BrowseSearch`,
 * this one builds `Link`s to `/providers` with a `DirectorySearch`, and
 * TanStack Router types both against their own route. A generic version would
 * be a pile of type parameters wrapping four lines of markup.
 */
function FilterGroup({
  icon: Icon,
  label,
  hint,
  options,
  selected,
  optionLabel,
  optionSuffix,
  toSearch,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  /** A line under the heading, where the label alone would overclaim. */
  hint?: string;
  options: readonly string[];
  selected: string | undefined;
  optionLabel: (value: string) => string;
  /** A count beside the label, where the data can say how many an option would return. */
  optionSuffix?: (value: string) => number | undefined;
  /** The search object for choosing this value, or `undefined` to clear it. */
  toSearch: (value: string | undefined) => DirectorySearch;
}) {
  return (
    <FilterSection icon={Icon} label={label} {...(hint ? { hint } : {})}>
      <div className="flex flex-wrap gap-2">
        {options.map((value) => {
          const active = selected === value;
          const suffix = optionSuffix?.(value);
          return (
            <Link
              key={value}
              to="/providers"
              // Clicking the active one clears it: a filter you set by clicking
              // should come off the same way, without hunting for a separate
              // "clear" the sidebar would otherwise need.
              search={toSearch(active ? undefined : value)}
              aria-pressed={active}
              className={cn(
                "type-caption inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors",
                active
                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] font-semibold text-[var(--color-primary)]"
                  // A surface of its own: unfilled, a chip on the panel's tint
                  // is an outline drawn on colour rather than a control.
                  : "border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-muted-foreground)]",
              )}
            >
              {optionLabel(value)}
              {suffix != null && (
                <span className="tabular-nums opacity-70">{suffix}</span>
              )}
            </Link>
          );
        })}
      </div>
    </FilterSection>
  );
}
