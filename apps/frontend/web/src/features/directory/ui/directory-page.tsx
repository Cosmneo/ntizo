import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Compass, MapPin, Search, SearchX, Store, Tag, X, icons } from "lucide-react";
import { EmptyCard } from "@/shared/components/empty-card";
import { SiteHeader } from "@/shared/components/site-header";
import {
  BrowseHero,
  BrowseSearchCard,
  BrowseSearchField,
  SEARCH_SUBMIT_CLASS,
} from "@/shared/components/browse/browse-hero";
import { CategoryRail, categoryChipClass } from "@/shared/components/browse/category-rail";
import { ResultsBar, segmentClass } from "@/shared/components/browse/results-bar";
import {
  ActiveFilterChip,
  ActiveFilterChips,
  CHIP_REMOVE_CLASS,
} from "@/shared/components/browse/active-filter-chips";
import { PAGER_EDGE_CLASS, Pager, pagerPageClass } from "@/shared/components/browse/pager";
import { EXACT_MATCH } from "@/shared/components/browse/active-match";
// Categories are platform data that happens to be fetched under `landing/`.
// Reached through its viewmodel rather than its repository — `ui` may not
// touch `data`, and going through the hook reuses the cache the home page has
// usually already filled.
import { useCategoryPreview } from "@/features/landing/viewmodel/use-categories";
import { useDirectory, useProviderCities } from "@/features/directory/viewmodel/use-directory";
import { ProviderListingCard } from "@/features/directory/ui/provider-listing-card";
import {
  MobileDirectoryFilterBar,
  ProviderFacets,
  clearedDirectorySearch,
} from "@/features/directory/ui/provider-facets";
import { DIRECTORY_PAGE_SIZE } from "@/features/directory/domain/provider-listing";
import {
  directorySearch,
  type DirectorySearch,
  type DirectorySort,
} from "@/features/directory/domain/directory-search";
import { directoryTitle } from "@/features/directory/domain/directory-title";
import { directoryFilterChips } from "@/features/directory/domain/directory-chips";

/**
 * Every listed business on the platform.
 *
 * The page a customer arrives on wanting a particular barber rather than
 * wanting a haircut — the rarer arrival, and why Providers sits after Services
 * in the nav.
 *
 * Deliberately the twin of `ServicesBrowsePage`: the same shells in the same
 * order, differing only in its copy, its card and its page size. The two had
 * already drifted once — one grew a row of sort links and the other a
 * five-item dropdown, and each carried its own copy of the category band — and
 * a reader who has learned one browse should not have to learn the other. If
 * the two page files differ in anything else, one of them is wrong.
 *
 * What the *card* says does differ, and should: a service sells one job, a
 * business is something somebody is deciding whether to trust.
 *
 * White cards on a tinted ground, which is why everything below the header is
 * wrapped in `--color-surface-raised`. It is not decoration: `PriceStub`'s
 * notches are circles of the *ground* colour punched into the card's edge, and
 * on a white page they are invisible.
 *
 * `useSuspenseQuery` under `useDirectory`, not `useQuery`: this page is
 * server-rendered so a crawler finds the listings in the HTML. A plain
 * `useQuery` would render its loading state on the server and ship a page with
 * no content in it — which is the one outcome a page built to rank must not
 * have.
 *
 * Paging is `total` and never `items.length`. The projection drops rows it
 * cannot render, so a page can be shorter than the page size while more pages
 * remain — counting what arrived told somebody with 40 matches that they had
 * 20.
 */
export function DirectoryPage() {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  // `strict: false` so this component stays usable outside its own route and
  // testable without one; the route validates before it reaches here.
  // Everything the URL says, kept as one object: every control on this page
  // is a link that changes one part of it and keeps the rest, and passing the
  // whole thing around is what stops each of them dropping the parts it does
  // not itself know about. See `directorySearch`.
  const current = useSearch({ strict: false }) as DirectorySearch;
  const { category, q, sort, offset = 0 } = current;
  const page = useDirectory(current, locale);
  // A plain query, unlike the listings: this is a control, not the content a
  // crawler came for, so it may arrive a beat later.
  const categories = useCategoryPreview(CATEGORY_RAIL_LIMIT).data?.items ?? [];
  const categoryName = categories.find((c) => c.code === category)?.name ?? null;

  const title = directoryTitle(current, categoryName);
  const chips = directoryFilterChips(current);

  /**
   * Whether the reader narrowed the list at all — which is what "nothing here"
   * means.
   *
   * Every filter has to appear here. One left out makes an empty result say
   * "the platform has nobody" to somebody who simply asked for verified
   * organizations in Maputo, which is false and reads as a broken directory
   * rather than as a filter worth loosening.
   */
  const isNarrowed =
    Boolean(q || category || current.city || current.providerType) ||
    current.minRating != null ||
    current.verified === true ||
    // Checked separately: a minimum of 0 is a narrowing the reader set, and
    // `??` would step over it as though they had set nothing.
    current.minPrice != null ||
    current.maxPrice != null;

  return (
    <>
      <SiteHeader current="providers" />

      <div className="bg-[var(--color-surface-raised)]">
        <BrowseHero
          kicker={{ badge: t("heroBadgeProviders"), body: t("heroBadgeProvidersBody") }}
          title={t(title.key, title.values)}
          subtitle={t("heroSubtitleProviders")}
          search={<HeroSearch current={current} />}
        />

        <CategoryRail label={t("providersFilterByCategory")}>
          <RailChip
            search={directorySearch(current, { category: undefined, offset: undefined })}
            label={t("providersAllCategories")}
            icon={null}
            isAll
            active={!category}
          />
          {categories.map((c) => (
            <RailChip
              key={c.id}
              search={directorySearch(current, { category: c.code, offset: undefined })}
              label={c.name}
              icon={c.icon}
              active={category === c.code}
            />
          ))}
        </CategoryRail>

        <main className="page-shell">
          <div className="grid items-start gap-11 py-8 lg:grid-cols-[250px_minmax(0,1fr)]">
            <ProviderFacets current={current} />

            <div className="min-w-0">
              <ResultsBar
                summary={
                  // Two translated pieces, and the second is a whole clause
                  // per scope — never "in" plus a name. That is what lets a
                  // language order, inflect or case the category and the city
                  // as its own grammar needs, instead of receiving them in the
                  // order English happened to put them. The values are
                  // `directoryTitle`'s own, so the heading and this line agree
                  // about whether the category name has resolved yet.
                  <>
                    <b className="font-semibold text-[var(--color-foreground)]">
                      {t("providersFound", { count: page.total })}
                    </b>{" "}
                    {t(`resultsScope.${resultsScope(title.values)}`, title.values)}
                  </>
                }
                sortLabel={t("sortLabel")}
              >
                {/* The default order is an ABSENT parameter, never
                    `sort=relevance`: `/providers` and `/providers?sort=relevance`
                    would otherwise be one page at two URLs, which is two cache
                    entries and two things for a crawler to index. */}
                <SortLink current={current} active={!sort} label={t("sortOption.default")} />
                <SortLink
                  current={current}
                  value="rating"
                  active={sort === "rating"}
                  label={t("sortOption.rating")}
                />
                <SortLink
                  current={current}
                  value="reviews"
                  active={sort === "reviews"}
                  label={t("sortOption.reviews")}
                />
                <SortLink
                  current={current}
                  value="price"
                  active={sort === "price"}
                  label={t("sortOption.price")}
                />
                <SortLink
                  current={current}
                  value="name"
                  active={sort === "name"}
                  label={t("sortOption.name")}
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
                            to="/providers"
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
                        to="/providers"
                        activeOptions={EXACT_MATCH}
                        search={clearedDirectorySearch(current)}
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
                // situations. An empty platform is "nobody has joined yet"; an
                // empty search is "nothing matches", and telling a reader who
                // filtered that the platform is empty is simply false. Only the
                // first is an empty list, so only the first carries the mark.
                isNarrowed ? (
                  <EmptyCard
                    className="mt-6"
                    icon={SearchX}
                    title={t("noResultsTitle")}
                    body={t("noResultsHint")}
                  />
                ) : (
                  <EmptyCard
                    className="mt-6"
                    badge={Store}
                    title={t("emptyTitle")}
                    body={t("empty")}
                  />
                )
              ) : (
                <>
                  {/* `items-start`: a stretched card puts its empty space
                      inside itself, under the last line of text. Sized to what
                      it has to say, the space falls between the cards. */}
                  <ul className="mt-4 grid list-none items-start gap-3.5 p-0">
                    {page.items.map((provider) => (
                      <ProviderListingCard
                        key={provider.id}
                        provider={provider}
                        locale={locale}
                        categoryIcon={
                          categories.find((c) => c.code === provider.categories[0]?.code)?.icon ??
                          null
                        }
                      />
                    ))}
                  </ul>

                  <Pager
                    total={page.total}
                    pageSize={DIRECTORY_PAGE_SIZE}
                    offset={offset}
                    label={t("pagerLabel")}
                    renderPage={(slot) => (
                      <Link
                        key={slot.page}
                        to="/providers"
                        activeOptions={EXACT_MATCH}
                        search={directorySearch(current, { offset: slot.offset })}
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
                              to="/providers"
                              activeOptions={EXACT_MATCH}
                              search={directorySearch(current, {
                                offset: Math.max(offset - DIRECTORY_PAGE_SIZE, 0),
                              })}
                              className={PAGER_EDGE_CLASS}
                            >
                              {t("providersPrevious")}
                            </Link>
                          ),
                        }
                      : {})}
                    {...(offset + DIRECTORY_PAGE_SIZE < page.total
                      ? {
                          next: (
                            <Link
                              to="/providers"
                              // Stepped from the total rather than from a
                              // server-issued cursor: `providerPageReadModel`
                              // carries a count and no `nextOffset`, because
                              // this directory pages by a fixed size rather
                              // than scrolling further. Never
                              // `offset + items.length` — a row dropped for
                              // being unrenderable still occupied a position
                              // in the underlying order, and stepping by the
                              // shorter number would fetch it again forever.
                              activeOptions={EXACT_MATCH}
                              search={directorySearch(current, {
                                offset: offset + DIRECTORY_PAGE_SIZE,
                              })}
                              className={PAGER_EDGE_CLASS}
                            >
                              {t("providersNext")}
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

      <MobileDirectoryFilterBar current={current} />
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
 * Derived from `directoryTitle`'s resolved values rather than from the raw
 * search, so the heading and the line under it can never disagree — the title
 * falls back to the plainer form while the category query is still in flight,
 * and this falls back with it instead of interpolating an empty name.
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
 * moment the other field was touched: type a name, pick Beira, and you got
 * `?city=Beira` with the name gone. It is a real `<form>` with a real
 * `type="submit"`, so Enter in the text field works because browsers make it
 * work, and the card is not the one control on a page of links that needs
 * JavaScript to do anything.
 *
 * The city field opens a `<select>` rather than a text box: the cities are a
 * closed set the server counts, and a typed place that matches none of them is
 * a search that silently returns nothing. It does **not** navigate on change —
 * arrowing through a native select fires `change` on every key on Windows and
 * Firefox, which would have run a search per city passed.
 *
 * Escape closes an open field, and closing puts focus back on the button that
 * opened it. A control that unmounts under the cursor and drops focus on
 * `<body>` sends a keyboard user back to the top of the document.
 *
 * Below `md` this stacks to one column. Task 21 replaces it there with a single
 * row that opens a sheet — two fields and a button in 360px is a control nobody
 * completes.
 */
function HeroSearch({ current }: { current: DirectorySearch }) {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();
  const cities = useProviderCities();
  const [open, setOpen] = useState<"q" | "city" | null>(null);
  const [term, setTerm] = useState(current.q ?? "");
  const [city, setCity] = useState(current.city ?? "");
  const termButton = useRef<HTMLButtonElement>(null);
  const cityButton = useRef<HTMLButtonElement>(null);

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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOpen(null);
    void navigate({
      to: "/providers",
      // Both fields, from the drafts. Either may have been edited without the
      // other being submitted first.
      search: directorySearch(current, {
        q: term.trim() || undefined,
        city: city.trim() || undefined,
        offset: undefined,
      }),
    });
  };

  const onEscape = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
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
          aria-label={t("searchFieldProvider")}
          placeholder={t("searchFieldProviderEmpty")}
          className="type-body min-w-0 rounded-[var(--radius-card-sm)] bg-[var(--color-surface-raised)] px-4 py-3 outline-none"
        />
      ) : (
        <BrowseSearchField
          ref={termButton}
          icon={Search}
          label={t("searchFieldProvider")}
          value={term || t("searchFieldProviderEmpty")}
          onClick={() => setOpen("q")}
        />
      )}

      {open === "city" ? (
        <select
          autoFocus
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={onEscape}
          aria-label={t("searchFieldCity")}
          className="type-body min-w-0 rounded-[var(--radius-card-sm)] bg-[var(--color-surface-raised)] px-4 py-3 outline-none"
        >
          <option value="">{t("searchFieldCityEmpty")}</option>
          {cities.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city}
            </option>
          ))}
        </select>
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
  /** Already built by `directorySearch`, which omits the category rather than emptying it. */
  search: DirectorySearch;
  label: string;
  /** A Lucide name from the category's own `icon` column, or null. */
  icon: string | null;
  isAll?: boolean;
  active: boolean;
}) {
  const Icon = iconComponent(icon, isAll);
  return (
    <Link
      to="/providers"
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

/** Changing the order keeps every filter and the search, and resets the page. */
function SortLink({
  current,
  value,
  active,
  label,
}: {
  current: DirectorySearch;
  value?: DirectorySort;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      to="/providers"
      activeOptions={EXACT_MATCH}
      search={directorySearch(current, { sort: value })}
      className={segmentClass(active)}
    >
      {label}
    </Link>
  );
}
