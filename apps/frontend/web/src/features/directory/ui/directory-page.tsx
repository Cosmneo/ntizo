import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { SearchX, Store } from "lucide-react";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { EmptyCard } from "@/shared/components/empty-card";
import { SiteHeader } from "@/shared/components/site-header";
import {
  CATEGORY_STRIP_LIMIT,
  CategoryStrip,
  categoryItemClass,
  iconComponent,
} from "@/shared/components/browse/category-strip";
import { SortDropdown } from "@/shared/components/browse/sort-dropdown";
import { QuickChips, quickChipClass } from "@/shared/components/browse/quick-chips";
import { PAGER_EDGE_CLASS, Pager, pagerPageClass } from "@/shared/components/browse/pager";
import { EXACT_MATCH } from "@/shared/components/browse/active-match";
import { formatRating } from "@/shared/domain/rating";
import { formatHeadlinePrice } from "@/features/directory/services/domain/service-card";
// Categories are platform data that happens to be fetched under `landing/`.
// Reached through its viewmodel rather than its repository — `ui` may not
// touch `data`, and going through the hook reuses the cache the home page has
// usually already filled.
import { useCategoryPreview } from "@/features/landing/viewmodel/use-categories";
import { useDirectory } from "@/features/directory/viewmodel/use-directory";
// One question about the hearts for the whole page, and the control that
// answers it — see the `useFavouriteMarks` call below for why the page owns
// the query rather than the row.
import { useFavouriteMarks } from "@/features/favourites/viewmodel/use-favourite-marks";
import { FavouriteButton } from "@/features/favourites/ui/favourite-button";
import { SaveToListDialog } from "@/features/favourites/ui/save-to-list-dialog";
import { ProviderRow } from "@/features/directory/ui/provider-row";
import {
  MobileProviderFilters,
  ProviderFilters,
  chooseProviderSort,
  providerSortOptions,
} from "@/features/directory/ui/provider-filters";
import { DIRECTORY_PAGE_SIZE } from "@/features/directory/domain/provider-listing";
import {
  directorySearch,
  type DirectorySearch,
  type RatingThreshold,
} from "@/features/directory/domain/directory-search";
import { directoryTitle } from "@/features/directory/domain/directory-title";
import { resultsScope, scopeValues } from "@/features/directory/domain/results-scope";

/**
 * Every listed business on the platform.
 *
 * The page a customer arrives on wanting a particular barber rather than
 * wanting a haircut — the rarer arrival, and why Providers sits after Services
 * in the nav.
 *
 * Deliberately the twin of `ServicesBrowsePage`: the same shells in the same
 * order, differing in exactly four things — the filters it draws, the copy it
 * counts with, a `<ul>` of rows in place of a grid of tiles, and a pager that
 * steps by the page size because `providerPageReadModel` carries a total and
 * no `nextOffset`. The two had already drifted once — one grew a row of sort
 * links and the other a five-item dropdown, and each carried its own copy of
 * the category band — and a reader who has learned one browse should not have
 * to learn the other. If the two page files differ in anything else, one of
 * them is wrong.
 *
 * What the *result* says does differ, and should: a service sells one job, a
 * business is something somebody is deciding whether to trust — which is why
 * a business gets a row with its services and their prices in it rather than
 * the tile a service gets. See `ProviderRow`.
 *
 * Four levels of narrowing, deliberately not the same shape. The header's own
 * search bar asks the opening question, pointed here and asking for a
 * business by name, so the question is asked in the same shape as everywhere
 * else. What differs is what a submit keeps: from a page with no list under
 * it the name is the whole URL, and here the bar is handed this page's own
 * `directorySearch`, so a typed name keeps the narrowing under it. The
 * category strip is full-width navigation between whole result sets. The
 * pills under the heading narrow one of those sets. The sort reorders what is
 * left. Making all four a row of chips would say they were peers.
 *
 * **Nothing in the results is blue.** The site's one blue goes where the site
 * always puts it — the header's sign-in and the search bar's button — and no
 * further down the page than that. The header's three destinations used to be
 * a third place and are not any more: they are bare text, and the lit one is
 * navy.
 * Everything below is headline navy, ink, grey and the amber star, which is
 * why the rows carry no border, no shadow and no button of their own: what
 * the eye should land on down a column of results is the photographs, the
 * ratings and the prices, not twenty identical calls to action.
 *
 * **Nothing straddles the strip.** Header, then strip, then `main`: three
 * bands stacked, none of them overlapping the next — the search band that
 * used to sit between the first two is inside the header now. The card that
 * once sat in a well across the strip's top edge is gone, so the strip is a
 * single positioned layer with no paint-order split — anything reintroduced
 * there on a negative margin would be painted over by it.
 *
 * **The phone is not this page shrunk.** The pills give way to four one-tap
 * chips above the results and one navy capsule at the thumb holding the
 * filters and the sort; see `MobileProviderFilters`.
 *
 * `useSuspenseQuery` under `useDirectory`, not `useQuery`: this page is
 * server-rendered so a crawler finds the listings in the HTML. A plain
 * `useQuery` would render its loading state on the server and ship a page with
 * no content in it — which is the one outcome a page built to rank must not
 * have.
 *
 * Paging is `page.total` and never `items.length`. The projection drops rows
 * it cannot render, so a page can be shorter than the page size while more
 * pages remain — counting what arrived told somebody with 40 matches that they
 * had 20, and stepping by it would have refetched the same row forever.
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
  /**
   * Which of the businesses on this page the reader has already saved — asked
   * **once, here**, and handed down as a filled or empty heart.
   *
   * `"provider"` and not `"service"`: a service and a business may
   * legitimately share an id, so the type rides along on every question and
   * every write, or one page's marks fill the other's hearts. Never a hook
   * inside the row, which would be one round trip per result. See
   * `useFavouriteMarks`.
   */
  const marks = useFavouriteMarks(
    "provider",
    page.items.map((item) => item.id),
  );
  /**
   * Which business the save-to-a-list dialog is about, and what its heart's
   * own save answered with. `null` is closed.
   *
   * The whole DTO rather than an id, and one dialog for the page rather than
   * one per row — the same two rulings `ServicesBrowsePage` records, since
   * these two pages differ only in what they list.
   */
  const [filing, setFiling] = useState<{
    provider: ProviderPublicDTO;
    listIds?: string[];
  } | null>(null);
  const navigate = useNavigate();
  // A plain query, unlike the listings: this is a control, not the content a
  // crawler came for, so it may arrive a beat later.
  const categories = useCategoryPreview(CATEGORY_STRIP_LIMIT).data?.items ?? [];
  const categoryName = categories.find((c) => c.code === category)?.name ?? null;

  const title = directoryTitle(current, categoryName);
  const scope = scopeValues(current, categoryName);

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
      {/* The site's search, not a search this page invented, and inside the
          header rather than in a band of its own beneath it: it is the same
          bar on every page, so it belongs to the chrome. Pointed at this list
          and asking for a name, because that is what a reader has in hand
          when they come looking for a business rather than a job. A submit
          builds its URL through `directorySearch` like every other control
          here, which is what holds on to the category, the filters, the city
          and the sort when a name is typed, and resets the page. The city is
          not one of the bar's own fields: that is the "City" filter pill
          below, where a narrowing belongs. */}
      <SiteHeader
        current="providers"
        search={{
          to: "/providers",
          placeholder: t("searchFieldProviderEmpty"),
          label: t("searchLabelProviders"),
          search: (q) => directorySearch(current, { q, offset: undefined }),
          initialValue: current.q ?? "",
        }}
      />

      <CategoryStrip label={t("categoryStripLabel")}>
        <StripItem
          search={directorySearch(current, { category: undefined, offset: undefined })}
          label={t("providersAllCategories")}
          icon={null}
          isAll
          active={!category}
        />
        {categories.map((c) => (
          <StripItem
            key={c.id}
            search={directorySearch(current, { category: c.code, offset: undefined })}
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
                happened to put them.

                `scopeValues`, not the heading's: a typed term outranks the
                category above, so reusing `title.values` printed "0 businesses
                found in all categories" over a search inside a category whose
                chip was lit two lines up. The clause names what is filtering. */}
            <p className="mt-1 text-[14.5px] text-[var(--color-muted-foreground)]">
              <b className="font-semibold text-[var(--color-foreground)]">
                {t("providersFound", { count: page.total })}
              </b>{" "}
              {t(`resultsScope.${resultsScope(scope)}`, scope)}
            </p>
          </div>

          {/* One sort per width: the phone's copy rides in the floating
              capsule (see `MobileProviderFilters`), so this one is drawn only
              where that capsule is not. Both read the same list and write
              through the same chooser, so they can never come to offer
              different orders. */}
          <SortDropdown
            active={sort}
            options={providerSortOptions(t)}
            sortLabel={t("sortTrigger")}
            triggerClassName="hidden text-[var(--color-headline)] lg:inline-flex"
            onChoose={chooseProviderSort(navigate, current)}
          />
        </div>

        <ProviderFilters current={current} />

        {/* The phone's four narrowings, one tap each, above the results they
            narrow — the pills are a toolbar and a toolbar does not fit a
            thumb. Hidden exactly where the floating capsule is hidden, so a
            reader is never offered both.

            Not drawn over an empty platform: four ways to narrow nothing,
            under a sentence saying nobody is listed, offers a reader work
            that cannot help them. They stay on an empty *search*, because
            there they are one tap out of it. */}
        {(page.items.length > 0 || isNarrowed) && (
          <div className="pb-5 lg:hidden">
            <QuickChips label={t("quickChipsLabel")}>
              <QuickChip
                current={current}
                active={current.verified === true}
                // `verified: false` is never written — `directorySearch` drops
                // it — so taking the chip off is taking the parameter off.
                change={{ verified: current.verified === true ? undefined : true }}
                label={t("filterVerifiedOnly")}
              />
              <QuickChip
                current={current}
                active={current.minRating === QUICK_MIN_RATING}
                change={{
                  minRating: current.minRating === QUICK_MIN_RATING ? undefined : QUICK_MIN_RATING,
                }}
                // The threshold is a decimal, so it is written the way this
                // reader writes decimals — the same function the rating pill
                // formats its own rows with, rather than a "4.5" hard-coded
                // for one of the eight languages the platform ships.
                label={t("filterRatingOption", {
                  score: formatRating(QUICK_MIN_RATING, locale),
                })}
              />
              <QuickChip
                current={current}
                active={current.providerType === "individual"}
                change={{
                  providerType: current.providerType === "individual" ? undefined : "individual",
                }}
                label={t("filterProviderKindOption.individual")}
              />
              <QuickChip
                current={current}
                active={current.providerType === "organization"}
                change={{
                  providerType:
                    current.providerType === "organization" ? undefined : "organization",
                }}
                label={t("filterProviderKindOption.organization")}
              />
            </QuickChips>
          </div>
        )}

        {page.items.length === 0 ? (
          // Two different sentences, because they are two different
          // situations. An empty platform is "nobody has joined yet"; an
          // empty search is "nothing matches", and telling a reader who
          // filtered that the platform is empty is simply false. Only the
          // first is an empty list, so only the first carries the mark.
          isNarrowed ? (
            <EmptyCard icon={SearchX} title={t("noResultsTitle")} body={t("noResultsHint")} />
          ) : (
            <EmptyCard badge={Store} title={t("emptyTitle")} body={t("empty")} />
          )
        ) : (
          <>
            {/* No gap of its own: a row draws the hairline that separates it
                from the one above, and space between them as well would be
                two separations doing one job. The first row is told it is
                first rather than working it out from a `first:` variant —
                inside `<li>` every article is its parent's first child, so
                the variant stripped the hairline from all of them. */}
            <ul className="grid list-none p-0">
              {page.items.map((provider, index) => (
                <li key={provider.id}>
                  <ProviderRow
                    provider={provider}
                    locale={locale}
                    first={index === 0}
                    favourite={
                      <FavouriteButton
                        targetType="provider"
                        targetId={provider.id}
                        saved={marks.isMarked(provider.id)}
                        // Fires when the save answers, never on the press:
                        // the lists come from the mutation's own data, so the
                        // dialog opens already knowing which are ticked. A
                        // press on an already-filled heart brings none, and
                        // the dialog asks for itself.
                        onSaved={({ listIds }) =>
                          setFiling({ provider, ...(listIds ? { listIds } : {}) })
                        }
                      />
                    }
                  />
                </li>
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
                        // carries a count and no `nextOffset`, because this
                        // directory pages by a fixed size rather than
                        // scrolling further. Never `offset + items.length` —
                        // a row dropped for being unrenderable still occupied
                        // a position in the underlying order, and stepping by
                        // the shorter number would fetch it again forever.
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
      </main>

      <MobileProviderFilters current={current} total={page.total} />

      {/* Mounted only while it is open, so its focus trap and the return of
          focus to the heart run on mount and unmount rather than off a prop. */}
      {filing && (
        <SaveToListDialog
          open
          onOpenChange={(open) => !open && setFiling(null)}
          targetType="provider"
          targetId={filing.provider.id}
          listing={providerListing(filing.provider, t, locale)}
          {...(filing.listIds ? { savedListIds: filing.listIds } : {})}
        />
      )}
    </>
  );
}

/**
 * The threshold the phone's rating chip offers.
 *
 * One of `RATING_THRESHOLDS` rather than a number of its own: a quick filter
 * is one tap onto a value the rating pill also offers, so tapping the chip and
 * picking the pill's top row have to write the same URL, and the chip has to
 * come back on when the pill was used instead.
 */
const QUICK_MIN_RATING: RatingThreshold = 4.5;

/**
 * What the dialog draws down its left panel: this business, said the way the
 * row beside it says it.
 *
 * Here rather than in the dialog, which is handed a listing and knows nothing
 * about providers. The photograph falls back to the logo — a business with no
 * cover photo usually has one, and the dialog's whole job is saying *which*
 * listing this is about.
 *
 * The price is `priceFrom`, never a bare amount: `fromAmountMinor` is the
 * cheapest of everything the business sells, and printing it alone would read
 * as a fixed price for whatever the reader was looking at.
 */
function providerListing(provider: ProviderPublicDTO, t: TFunction, locale: string) {
  const place = [provider.district, provider.city].filter(Boolean).join(", ");
  return {
    imageUrl: provider.photoUrls[0] ?? provider.logoUrl ?? null,
    name: provider.name,
    byline:
      place ||
      provider.categories[0]?.name ||
      t(`filterProviderKindOption.${provider.type}`),
    ...(provider.fromAmountMinor !== null && provider.fromCurrency !== null
      ? {
          price: t("priceFrom", {
            amount: formatHeadlinePrice(
              provider.fromAmountMinor,
              provider.fromCurrency,
              locale,
            ),
          }),
        }
      : {}),
  };
}

/** One category, as a chip in the strip: its icon beside its name. */
function StripItem({
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
      className={categoryItemClass(active)}
    >
      <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

/**
 * One of the phone's quick narrowings.
 *
 * A link like every other filter on this page, and a toggle like every option
 * row: tapping the one already on hands back the same search without it, so a
 * chip comes off the way it went on. `directorySearch` builds the URL, so a
 * chip cannot drop the term, the category or the order the way a hand-built
 * search object at this call site would.
 */
function QuickChip({
  current,
  active,
  change,
  label,
}: {
  current: DirectorySearch;
  active: boolean;
  /** The one parameter this chip writes — or clears, when it is already on. */
  change: DirectorySearch;
  label: string;
}) {
  return (
    /* `shrink-0` here as well as on the link: this `<li>` is the flex item
       `QuickChips` lays out, and it is the one that was being squeezed. */
    <li className="shrink-0">
      <Link
        to="/providers"
        activeOptions={EXACT_MATCH}
        search={directorySearch(current, { ...change, offset: undefined })}
        aria-pressed={active}
        className={quickChipClass(active)}
      >
        {label}
      </Link>
    </li>
  );
}
