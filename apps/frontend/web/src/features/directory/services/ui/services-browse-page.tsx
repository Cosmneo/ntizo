import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Compass, LayoutGrid, MapPin, Search, SearchX, Tag, X, icons } from "lucide-react";
import { CitySelect } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import { SiteHeader } from "@/shared/components/site-header";
import {
  BrowseHero,
  BrowseSearchCard,
  BrowseSearchField,
  SEARCH_SUBMIT_CLASS,
} from "@/shared/components/browse/browse-hero";
import { CategoryRail, categoryChipClass } from "@/shared/components/browse/category-rail";
import { ResultsBar } from "@/shared/components/browse/results-bar";
import { SortDropdown, type SortDropdownOption } from "@/shared/components/browse/sort-dropdown";
import {
  ActiveFilterChip,
  ActiveFilterChips,
  CHIP_REMOVE_CLASS,
} from "@/shared/components/browse/active-filter-chips";
import { PAGER_EDGE_CLASS, Pager, pagerPageClass } from "@/shared/components/browse/pager";
import {
  MOBILE_SEARCH_FIELD_CLASS,
  MobileSearchSheet,
  MobileSearchTrigger,
} from "@/shared/components/browse/mobile-search-sheet";
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
import { ServiceListingCard } from "@/features/directory/services/ui/service-listing-card";
import {
  MobileFilterBar,
  ServiceFacets,
  clearedBrowseSearch,
} from "@/features/directory/services/ui/service-facets";
import { BROWSE_PAGE_SIZE, type BrowseSort } from "@/features/directory/services/domain/types";
import {
  browseSearch,
  type BrowseSearch,
} from "@/features/directory/services/domain/browse-search";
import { browseTitle } from "@/features/directory/services/domain/browse-title";
import { browseFilterChips } from "@/features/directory/services/domain/browse-chips";

/**
 * Every published service on the platform.
 *
 * The page a customer arrives on wanting a haircut rather than wanting a
 * particular barber — the commoner arrival, and why Services sits before
 * Providers in the nav.
 *
 * Four levels of narrowing, deliberately not the same shape. The hero's search
 * card asks the opening question. The category rail is full-bleed navigation
 * between whole result sets. The sidebar narrows one of those sets. The sort
 * reorders what is left. Making all four a row of chips would say they were
 * peers.
 *
 * White cards on a tinted ground, which is why everything below the header is
 * wrapped in `--color-surface-raised`. It is not decoration: `PriceStub`'s
 * notches are circles of the *ground* colour punched into the card's edge, and
 * on a white page they are invisible.
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
  const categories = useCategoryPreview(CATEGORY_RAIL_LIMIT).data?.items ?? [];
  const categoryName = categories.find((c) => c.code === category)?.name ?? null;

  const title = browseTitle(current, categoryName);
  const chips = browseFilterChips(current);

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
      <SiteHeader current="services" />

      <div className="bg-[var(--color-surface-raised)]">
        <BrowseHero
          title={t(title.key, title.values)}
          subtitle={t("heroSubtitleServices")}
          search={<HeroSearch current={current} />}
        />

        <CategoryRail label={t("servicesFilterByCategory")}>
          <RailChip
            search={browseSearch(current, { category: undefined, offset: undefined })}
            label={t("servicesAllCategories")}
            icon={null}
            isAll
            active={!category}
          />
          {categories.map((c) => (
            <RailChip
              key={c.id}
              search={browseSearch(current, { category: c.code, offset: undefined })}
              label={c.name}
              icon={c.icon}
              active={category === c.code}
            />
          ))}
        </CategoryRail>

        <main className="page-shell">
          <div className="grid items-start gap-11 py-8 lg:grid-cols-[250px_minmax(0,1fr)]">
            <ServiceFacets current={current} />

            <div className="min-w-0">
              <ResultsBar
                summary={
                  // Two translated pieces, and the second is a whole clause
                  // per scope — never "in" plus a name. That is what lets a
                  // language order, inflect or case the category and the city
                  // as its own grammar needs, instead of receiving them in the
                  // order English happened to put them. The values are
                  // `browseTitle`'s own, so the heading and this line agree
                  // about whether the category name has resolved yet.
                  <>
                    <b className="font-semibold text-[var(--color-foreground)]">
                      {t("servicesFound", { count: page.total })}
                    </b>{" "}
                    {t(`resultsScope.${resultsScope(title.values)}`, title.values)}
                  </>
                }
              >
                <SortDropdown
                  active={sort}
                  options={sortOptions}
                  sortLabel={t("sortLabel")}
                  onChoose={chooseSort}
                />
              </ResultsBar>

              {/* Only when something is on. An empty chip row is a band of
                  padding between the results bar and the first card. */}
              {chips.length > 0 && (
                <div className="pt-3.5">
                  <ActiveFilterChips label={t("activeFiltersLabel")}>
                    {chips.map((chip) => (
                      <ActiveFilterChip
                        key={chip.key}
                        label={t(chip.label.key, chip.label.values ?? {})}
                        remove={
                          <Link
                            to="/services"
                            activeOptions={EXACT_MATCH}
                            search={chip.next}
                            aria-label={t("chipRemove")}
                            className={CHIP_REMOVE_CLASS}
                          >
                            <X className="h-2.5 w-2.5" aria-hidden="true" />
                          </Link>
                        }
                      />
                    ))}
                    <li>
                      <Link
                        to="/services"
                        activeOptions={EXACT_MATCH}
                        search={clearedBrowseSearch(current)}
                        className="type-caption ml-0.5 font-semibold text-[var(--color-primary)] hover:underline"
                      >
                        {t("filtersClearAll")}
                      </Link>
                    </li>
                  </ActiveFilterChips>
                </div>
              )}

              {page.items.length === 0 ? (
                // Two different sentences, because they are two different
                // situations. An empty platform is "nothing published yet"; an
                // empty search is "nothing matches", and telling a reader who
                // searched that the platform is empty is simply false. Only the
                // first is an empty list, so only the first carries the mark.
                isNarrowed ? (
                  <EmptyCard
                    className="mt-6"
                    icon={SearchX}
                    title={t("servicesNoMatch")}
                    body={t("servicesNoMatchHint")}
                  />
                ) : (
                  <EmptyCard
                    className="mt-6"
                    badge={LayoutGrid}
                    title={t("servicesEmptyTitle")}
                    body={t("servicesEmpty")}
                  />
                )
              ) : (
                <>
                  {/* `items-start`: a stretched card puts its empty space
                      inside itself, under the last line of text. Sized to what
                      it has to say, the space falls between the cards. */}
                  <ul className="mt-4 grid list-none items-start gap-3.5 p-0">
                    {page.items.map((service) => (
                      <ServiceListingCard
                        key={service.id}
                        service={service}
                        locale={locale}
                      />
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
            </div>
          </div>
        </main>
      </div>

      <MobileFilterBar current={current} />
    </>
  );
}

/**
 * How many categories the rail offers.
 *
 * The same page size the category browse uses, so the two ask for one set and
 * share a cache entry rather than fetching overlapping halves.
 */
const CATEGORY_RAIL_LIMIT = 24;

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
 * The hero's search card.
 *
 * Two fields and a button, as the approved mockup draws them. `BrowseSearchField`
 * is a button rather than an input because both fields *open* something; what
 * they open here is themselves — the resting state shows what is currently
 * searched, and choosing one swaps a real control into the same grid cell so
 * nothing on the card moves.
 *
 * **One form, one submission.** Both fields are drafts until the button is
 * pressed, and the URL is written from the drafts, not from what the URL
 * already said. Composing from `current` instead threw away a typed term the
 * moment the other field was touched: type "corte", pick Beira, and you got
 * `?city=Beira` with the word gone. It is a real `<form>` with a real
 * `type="submit"`, so Enter in the text field works because browsers make it
 * work, and the card is not the one control on a page of links that needs
 * JavaScript to do anything.
 *
 * The city field opens a `CitySelect` — the same combobox `AddressesPage` and
 * provider `Settings` already use — rather than the raw `<select>` the first
 * version of this reached for under time pressure. A native select carries no
 * card styling into its own popup, so opened it looked like a control from a
 * different application; it also needed two clicks, because focusing a select
 * and opening its list are two different things. `CitySelect` is focused as it
 * mounts, and because *its own* focus handler is what opens its list, the swap
 * that reveals it is the one click that opens it too. Typing and arrowing
 * through the list still do not navigate — only picking a city or submitting
 * the form does — which matters because a native select's `change` fired on
 * every arrow key on Windows and Firefox, and would have run a search per city
 * passed.
 *
 * Escape on the *service* field closes it and puts focus back on the button
 * that opened it — a control that unmounts under the cursor and drops focus on
 * `<body>` sends a keyboard user back to the top of the document. The city
 * field has no such hand-rolled handler: `CitySelect` already closes its own
 * list on Escape, and layering a second handler on top of a control that
 * manages its own open state would fight it rather than help it.
 *
 * **Not drawn at all below `md`.** Two fields and a button in 360px is a
 * control nobody completes, so the card hides itself there and
 * `MobileSearchTrigger` takes the width — one row that opens a sheet holding
 * the same two fields, full size. Both write the URL through one `apply`,
 * because they are the same search asked at two widths and not two searches.
 */
function HeroSearch({ current }: { current: BrowseSearch }) {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();
  const cities = useServiceCities();
  const cityFieldId = useId();
  const [open, setOpen] = useState<"q" | "city" | null>(null);
  // The phone's sheet, which is the whole card at that width. Its own state
  // rather than a third value of `open`: the two never overlap, because one is
  // drawn only below `md` and the other only from `md` up.
  const [sheet, setSheet] = useState(false);
  const [term, setTerm] = useState(current.q ?? "");
  const [city, setCity] = useState(current.city ?? "");
  const termButton = useRef<HTMLButtonElement>(null);
  const cityButton = useRef<HTMLButtonElement>(null);
  // `CitySelect` does no filtering of its own — it only shows what it is
  // given — so narrowing the offered set as the reader types is this field's
  // job, not the combobox's.
  const cityOptions = cities
    .map((c) => c.city)
    .filter((c) => c.toLowerCase().includes(city.trim().toLowerCase()));

  // The URL is the authority. Going back to a previous search has to put that
  // search back in both fields, or they would go on offering a question the
  // results no longer answer.
  useEffect(() => {
    setTerm(current.q ?? "");
    setCity(current.city ?? "");
    setOpen(null);
  }, [current.q, current.city]);

  /**
   * Closing hands focus back to the button that opened the field, because the
   * control the reader is standing on is about to stop existing.
   */
  const close = () => {
    const back = open === "q" ? termButton : cityButton;
    setOpen(null);
    // After the swap, not before: the button does not exist yet at this point.
    queueMicrotask(() => back.current?.focus());
  };

  /**
   * The drafts, written to the URL.
   *
   * Shared by the card and the sheet, which are the same search asked at two
   * widths — two copies of this is how one of them starts dropping a
   * parameter the other keeps.
   */
  const apply = () => {
    setOpen(null);
    void navigate({
      to: "/services",
      // Both fields, from the drafts. Either may have been edited without the
      // other being submitted first.
      search: browseSearch(current, {
        q: term.trim() || undefined,
        city: city.trim() || undefined,
        offset: undefined,
      }),
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply();
  };

  const onEscape = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <>
      <BrowseSearchCard
        onSubmit={submit}
        action={
          <button type="submit" className={SEARCH_SUBMIT_CLASS}>
            <Search className="h-4 w-4" aria-hidden="true" />
            {t("searchSubmit")}
          </button>
        }
      >
        {open === "q" ? (
          <input
            type="search"
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onEscape}
            aria-label={t("searchFieldService")}
            placeholder={t("searchFieldServiceEmpty")}
            className="type-body min-w-0 rounded-[var(--radius-card-sm)] bg-[var(--color-surface-raised)] px-4 py-3 outline-none"
          />
        ) : (
          <BrowseSearchField
            ref={termButton}
            icon={Search}
            label={t("searchFieldService")}
            value={term || t("searchFieldServiceEmpty")}
            onClick={() => setOpen("q")}
          />
        )}

        {open === "city" ? (
          <div className="flex min-w-0 items-center">
            {/* Visually hidden: the button it replaces carries its own label
                above the value, and putting a second one here would be the
                card growing a line it never had at rest. */}
            <label htmlFor={cityFieldId} className="sr-only">
              {t("searchFieldCity")}
            </label>
            <CitySelect
              id={cityFieldId}
              value={city}
              onChange={setCity}
              cities={cityOptions}
              autoFocus
              placeholder={t("searchFieldCityEmpty")}
              toggleLabel={t("searchFieldCityToggle")}
              noResultsText={t("searchFieldCityNoResults")}
              className="w-full"
            />
          </div>
        ) : (
          <BrowseSearchField
            ref={cityButton}
            icon={MapPin}
            label={t("searchFieldCity")}
            value={city || t("searchFieldCityEmpty")}
            onClick={() => setOpen("city")}
          />
        )}
      </BrowseSearchCard>

      <MobileSearchTrigger
        label={term || t("searchFieldServiceEmpty")}
        value={city || t("searchFieldCityEmpty")}
        onOpen={() => setSheet(true)}
      />

      {/* Real controls, both of them, rather than the card's click-to-open
          fields: the sheet is the whole screen, so there is nothing to save by
          collapsing them and nothing on the card left to shift when they
          expand. */}
      <MobileSearchSheet
        open={sheet}
        onOpenChange={setSheet}
        title={t("mobileSearchTitle")}
        apply={t("mobileSearchApply")}
        onApply={apply}
      >
        <label className="grid gap-1.5">
          <span className="type-caption font-semibold">{t("searchFieldService")}</span>
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("searchFieldServiceEmpty")}
            className={MOBILE_SEARCH_FIELD_CLASS}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="type-caption font-semibold">{t("searchFieldCity")}</span>
          {/* The same `CitySelect` the card uses, and for the same reason the
              card carries it: a raw `<select>` here still opened the OS's own
              popup, which is exactly the mismatch a screenshot caught on the
              card. Wrapped in the `<label>` above rather than given an `id`,
              like `Serviço`'s own input beside it — the label's one labelable
              descendant is `CitySelect`'s `<input>`, so the association still
              holds without one. */}
          <CitySelect
            value={city}
            onChange={setCity}
            cities={cityOptions}
            placeholder={t("searchFieldCityEmpty")}
            toggleLabel={t("searchFieldCityToggle")}
            noResultsText={t("searchFieldCityNoResults")}
          />
        </label>
      </MobileSearchSheet>
    </>
  );
}

/** One category, as a chip in the rail. */
function RailChip({
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
      className={categoryChipClass(active)}
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
    </Link>
  );
}

/**
 * A Lucide name from the database, resolved to the component.
 *
 * Looked up rather than imported one by one: the set lives in a table an
 * administrator edits, so the code cannot know it at build time. An unknown or
 * missing name falls back to a tag rather than rendering nothing — a rail with
 * a hole in it reads as a broken row, not as a category without an icon.
 */
function iconComponent(name: string | null, isAll: boolean) {
  if (isAll) return Compass;
  if (!name) return Tag;
  return icons[name as keyof typeof icons] ?? Tag;
}
