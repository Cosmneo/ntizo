import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Compass, LayoutGrid, SearchX, Tag, icons } from "lucide-react";
import { EmptyCard } from "@/shared/components/empty-card";
import { SiteHeader } from "@/shared/components/site-header";
import { SearchPill } from "@/shared/components/browse/search-pill";
import { CategoryStrip, categoryItemClass } from "@/shared/components/browse/category-strip";
import { SortDropdown, type SortDropdownOption } from "@/shared/components/browse/sort-dropdown";
import { QuickChips, quickChipClass } from "@/shared/components/browse/quick-chips";
import { PAGER_EDGE_CLASS, Pager, pagerPageClass } from "@/shared/components/browse/pager";
import { EXACT_MATCH } from "@/shared/components/browse/active-match";
// Categories are platform data that happens to be fetched under `landing/`.
// Reached through its viewmodel rather than its repository — `ui` may not
// touch `data`, and going through the hook reuses the cache the home page has
// usually already filled.
import { useCategoryPreview } from "@/features/landing/viewmodel/use-categories";
import {
  useBrowseServices,
  useServiceCities,
} from "@/features/directory/services/viewmodel/use-browse-services";
import { ServiceTile } from "@/features/directory/services/ui/service-tile";
import {
  MobileServiceFilters,
  ServiceFilters,
} from "@/features/directory/services/ui/service-filters";
import { BROWSE_PAGE_SIZE, type BrowseSort } from "@/features/directory/services/domain/types";
import {
  browseSearch,
  type BrowseSearch,
} from "@/features/directory/services/domain/browse-search";
import { browseTitle } from "@/features/directory/services/domain/browse-title";

/**
 * Every published service on the platform.
 *
 * The page a customer arrives on wanting a haircut rather than wanting a
 * particular barber — the commoner arrival, and why Services sits before
 * Providers in the nav.
 *
 * Four levels of narrowing, deliberately not the same shape. The header's
 * search pill asks the opening question, in the same place it is asked on
 * every page of the site. The category strip is full-width navigation between
 * whole result sets. The pills under the heading narrow one of those sets. The
 * sort reorders what is left. Making all four a row of chips would say they
 * were peers.
 *
 * **A white page with one blue on it** — the pill's search button. Everything
 * else is headline navy, ink, grey and the amber star, which is why the tiles
 * carry no border, no shadow and no button of their own: what the eye should
 * land on down a column of results is the photographs and the prices, not
 * twenty-four identical calls to action.
 *
 * **Nothing straddles the strip.** The header sits above it, the strip is a
 * plain white band with a hairline under it, and `main` starts below. The
 * search that used to sit in a card across that band's top edge lives in the
 * header now, so the strip is a single positioned layer with no paint-order
 * split — anything reintroduced there on a negative margin would be painted
 * over by it.
 *
 * **The phone is not this page shrunk.** The pills give way to three one-tap
 * chips above the results and one navy capsule at the thumb holding the
 * filters and the sort; see `MobileServiceFilters`.
 *
 * Paging is `page.total` and never `items.length`. The projection drops rows it
 * cannot render, so a page can be shorter than the page size while more pages
 * remain — counting what arrived told somebody with 40 matches that they had
 * 24, and stepping by it would have refetched the same row forever.
 */
export function ServicesBrowsePage() {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  // `strict: false` so this component stays usable outside its own route and
  // testable without one; the route validates before it reaches here.
  // Everything the URL says, kept as one object: every control on this page
  // is a link that changes one part of it and keeps the rest, and passing the
  // whole thing around is what stops each of them dropping the parts it does
  // not itself know about. See `browseSearch`.
  const current = useSearch({ strict: false }) as BrowseSearch;
  const { category, q, sort, offset = 0 } = current;
  const page = useBrowseServices({
    category,
    locationType: current.locationType,
    paymentMode: current.paymentMode,
    providerType: current.providerType,
    language: current.language,
    city: current.city,
    minPrice: current.minPrice,
    maxPrice: current.maxPrice,
    q,
    sort,
    offset,
  });
  const navigate = useNavigate();
  // A plain query, unlike the services: this is a control, not the content a
  // crawler came for, so it may arrive a beat later.
  const categories = useCategoryPreview(CATEGORY_STRIP_LIMIT).data?.items ?? [];
  const categoryName = categories.find((c) => c.code === category)?.name ?? null;

  const title = browseTitle(current, categoryName);

  /** Every order this page offers, default first — `SortDropdown`'s menu. */
  const sortOptions: ReadonlyArray<SortDropdownOption<BrowseSort>> = [
    { value: undefined, label: t("sortOption.default") },
    { value: "newest", label: t("sortOption.newest") },
    { value: "price", label: t("sortOption.price") },
  ];

  /**
   * Writes the chosen order and resets to the first page — page 4 of "cheapest"
   * is not page 4 of "newest". `browseSearch` is what keeps every other filter
   * and writes the default order as an absent parameter rather than
   * `sort=default`.
   */
  const chooseSort = (value: BrowseSort | undefined) =>
    void navigate({
      to: "/services",
      search: browseSearch(current, { sort: value, offset: undefined }),
    });

  /**
   * Whether the reader narrowed the list at all — which is what "nothing here"
   * means.
   *
   * Every filter has to appear here. One left out makes an empty result say
   * "the platform has published nothing" to somebody who simply asked for
   * hourly work from organizations in Maputo, which is false and reads as a
   * broken catalogue rather than as a filter worth loosening.
   */
  const isNarrowed =
    Boolean(
      category ??
        current.locationType ??
        current.paymentMode ??
        current.providerType ??
        current.language ??
        current.city ??
        q,
    ) ||
    // Checked separately: a minimum of 0 is a narrowing the reader set, and
    // `??` would step over it as though they had set nothing.
    current.minPrice != null ||
    current.maxPrice != null;

  return (
    <>
      <SiteHeader current="services" search={<HeroSearch current={current} />} />

      <CategoryStrip label={t("categoryStripLabel")}>
        <StripItem
          search={browseSearch(current, { category: undefined, offset: undefined })}
          label={t("servicesAllCategories")}
          icon={null}
          isAll
          active={!category}
        />
        {categories.map((c) => (
          <StripItem
            key={c.id}
            search={browseSearch(current, { category: c.code, offset: undefined })}
            label={c.name}
            icon={c.icon}
            active={category === c.code}
          />
        ))}
      </CategoryStrip>

      <main className="page-shell pb-14">
        <div className="flex items-end justify-between gap-5 pt-6 pb-3.5">
          <div>
            <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-[var(--color-headline)]">
              {t(title.key, title.values)}
            </h1>
            {/* Two translated pieces, and the second is a whole clause per
                scope — never "in" plus a name. That is what lets a language
                order, inflect or case the category and the city as its own
                grammar needs, instead of receiving them in the order English
                happened to put them. The values are `browseTitle`'s own, so
                the heading and this line agree about whether the category name
                has resolved yet. */}
            <p className="mt-1 text-[14.5px] text-[var(--color-muted-foreground)]">
              <b className="font-semibold text-[var(--color-foreground)]">
                {t("servicesFound", { count: page.total })}
              </b>{" "}
              {t(`resultsScope.${resultsScope(title.values)}`, title.values)}
            </p>
          </div>

          {/* One sort per width: the phone's copy rides in the floating
              capsule (see `MobileServiceFilters`), so this one is drawn only
              where that capsule is not. */}
          <SortDropdown
            active={sort}
            options={sortOptions}
            sortLabel={t("sortTrigger")}
            triggerClassName="hidden text-[var(--color-headline)] lg:inline-flex"
            onChoose={chooseSort}
          />
        </div>

        <ServiceFilters current={current} />

        {/* The phone's two or three narrowings, one tap each, above the results
            they narrow — the pills are a toolbar and a toolbar does not fit a
            thumb. Hidden exactly where the floating capsule is hidden, so a
            reader is never offered both. */}
        <div className="pb-5 lg:hidden">
          <QuickChips label={t("filtersTitle")}>
            <QuickChip
              current={current}
              active={current.paymentMode === "fixed"}
              change={{ paymentMode: current.paymentMode === "fixed" ? undefined : "fixed" }}
              label={t("filterPaymentOption.fixed")}
            />
            <QuickChip
              current={current}
              active={current.locationType === "at_customer"}
              change={{
                locationType: current.locationType === "at_customer" ? undefined : "at_customer",
              }}
              label={t("filterWhereOption.at_customer")}
            />
            <QuickChip
              current={current}
              active={current.maxPrice === QUICK_MAX_PRICE}
              change={{
                maxPrice: current.maxPrice === QUICK_MAX_PRICE ? undefined : QUICK_MAX_PRICE,
              }}
              label={t("chipPriceMax", { max: QUICK_MAX_PRICE })}
            />
          </QuickChips>
        </div>

        {page.items.length === 0 ? (
          // Two different sentences, because they are two different
          // situations. An empty platform is "nothing published yet"; an
          // empty search is "nothing matches", and telling a reader who
          // searched that the platform is empty is simply false. Only the
          // first is an empty list, so only the first carries the mark.
          isNarrowed ? (
            <EmptyCard icon={SearchX} title={t("servicesNoMatch")} body={t("servicesNoMatchHint")} />
          ) : (
            <EmptyCard
              badge={LayoutGrid}
              title={t("servicesEmptyTitle")}
              body={t("servicesEmpty")}
            />
          )
        ) : (
          <>
            {/* Four across at `lg`, one below `sm`. The row gap is larger than
                the column gap on purpose: the tiles carry no border, so what
                separates one row from the next is the space itself, and equal
                gaps read as a grid of unrelated things rather than as rows. */}
            <ul className="grid list-none grid-cols-1 gap-x-6 gap-y-8 p-0 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {page.items.map((service) => (
                <li key={service.id}>
                  <ServiceTile service={service} locale={locale} />
                </li>
              ))}
            </ul>

            <Pager
              total={page.total}
              pageSize={BROWSE_PAGE_SIZE}
              offset={offset}
              label={t("pagerLabel")}
              renderPage={(slot) => (
                <Link
                  key={slot.page}
                  to="/services"
                  activeOptions={EXACT_MATCH}
                  search={browseSearch(current, { offset: slot.offset })}
                  aria-current={slot.current ? "page" : undefined}
                  className={pagerPageClass(slot.current)}
                >
                  {slot.page}
                </Link>
              )}
              {...(offset > 0
                ? {
                    previous: (
                      <Link
                        to="/services"
                        activeOptions={EXACT_MATCH}
                        search={browseSearch(current, {
                          offset: Math.max(offset - BROWSE_PAGE_SIZE, 0),
                        })}
                        className={PAGER_EDGE_CLASS}
                      >
                        {t("servicesPrevious")}
                      </Link>
                    ),
                  }
                : {})}
              {...(page.nextOffset !== null
                ? {
                    next: (
                      <Link
                        to="/services"
                        // The server's own number, never
                        // `offset + items.length`: a row dropped for
                        // being unrenderable still occupied a position in
                        // the underlying order, and stepping by the
                        // shorter number would fetch it again forever.
                        activeOptions={EXACT_MATCH}
                        search={browseSearch(current, { offset: page.nextOffset })}
                        className={PAGER_EDGE_CLASS}
                      >
                        {t("servicesNext")}
                      </Link>
                    ),
                  }
                : {})}
            />
          </>
        )}
      </main>

      <MobileServiceFilters current={current} total={page.total} />
    </>
  );
}

/**
 * How many categories the strip offers.
 *
 * The same page size the category browse uses, so the two ask for one set and
 * share a cache entry rather than fetching overlapping halves.
 */
const CATEGORY_STRIP_LIMIT = 24;

/**
 * The ceiling the phone's price chip offers, in whole meticais.
 *
 * One number rather than a range, because a quick filter is one tap: the chip
 * says "up to 1000" and taps off again. Whole units, which is what the URL and
 * `PriceRangeFilter`'s own boxes carry.
 */
const QUICK_MAX_PRICE = 1000;

/**
 * Which `resultsScope` clause the summary ends with.
 *
 * Derived from `browseTitle`'s resolved values rather than from the raw search,
 * so the heading and the line under it can never disagree — the title falls
 * back to the plainer form while the category query is still in flight, and
 * this falls back with it instead of interpolating an empty name.
 */
function resultsScope(values: { category?: string; city?: string }): string {
  if (values.category) return values.city ? "categoryCity" : "category";
  return values.city ? "city" : "all";
}

/**
 * The header's search, wired to this page's URL. `SearchPill` owns the fields,
 * the drafts, the phone sheet and every reason for them — see its own comment;
 * all this adds is where an applied search goes.
 */
function HeroSearch({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();
  const cities = useServiceCities();

  return (
    <SearchPill
      termLabel={t("searchFieldService")}
      termPlaceholder={t("searchFieldServiceEmpty")}
      cityLabel={t("searchFieldCity")}
      cityPlaceholder={t("searchFieldCityEmpty")}
      term={current.q ?? ""}
      city={current.city ?? ""}
      cities={cities.map((c) => c.city)}
      onApply={({ term, city }) =>
        void navigate({
          to: "/services",
          // Both fields, from the pill's drafts. Either may have been edited
          // without the other being submitted first, which is why they arrive
          // together rather than being read back off `current`.
          search: browseSearch(current, {
            q: term || undefined,
            city: city || undefined,
            offset: undefined,
          }),
        })
      }
    />
  );
}

/** One category, as an item in the strip: its icon over its name. */
function StripItem({
  search,
  label,
  icon,
  isAll = false,
  active,
}: {
  /** Already built by `browseSearch`, which omits the category rather than emptying it. */
  search: BrowseSearch;
  label: string;
  /** A Lucide name from the category's own `icon` column, or null. */
  icon: string | null;
  isAll?: boolean;
  active: boolean;
}) {
  const Icon = iconComponent(icon, isAll);
  return (
    <Link
      to="/services"
      activeOptions={EXACT_MATCH}
      search={search}
      className={categoryItemClass(active)}
    >
      <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

/**
 * One of the phone's quick narrowings.
 *
 * A link like every other filter on this page, and a toggle like every option
 * row: tapping the one already on hands back the same search without it, so a
 * chip comes off the way it went on. `browseSearch` builds the URL, so a chip
 * cannot drop the term, the category or the order the way a hand-built search
 * object at this call site would.
 */
function QuickChip({
  current,
  active,
  change,
  label,
}: {
  current: BrowseSearch;
  active: boolean;
  /** The one parameter this chip writes — or clears, when it is already on. */
  change: BrowseSearch;
  label: string;
}) {
  return (
    <li>
      <Link
        to="/services"
        activeOptions={EXACT_MATCH}
        search={browseSearch(current, { ...change, offset: undefined })}
        aria-pressed={active}
        className={quickChipClass(active)}
      >
        {label}
      </Link>
    </li>
  );
}

/**
 * A Lucide name from the database, resolved to the component.
 *
 * Looked up rather than imported one by one: the set lives in a table an
 * administrator edits, so the code cannot know it at build time. An unknown or
 * missing name falls back to a tag rather than rendering nothing — a strip with
 * a hole in it reads as a broken row, not as a category without an icon.
 */
function iconComponent(name: string | null, isAll: boolean) {
  if (isAll) return Compass;
  if (!name) return Tag;
  return icons[name as keyof typeof icons] ?? Tag;
}
