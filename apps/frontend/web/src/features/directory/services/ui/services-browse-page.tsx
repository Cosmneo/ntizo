import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { LayoutGrid, SearchX } from "lucide-react";
import { EmptyCard } from "@/shared/components/empty-card";
import { SiteHeader } from "@/shared/components/site-header";
import { SortDropdown } from "@/shared/components/browse/sort-dropdown";
import { QuickChips, quickChipClass } from "@/shared/components/browse/quick-chips";
import { PAGER_EDGE_CLASS, Pager, pagerPageClass } from "@/shared/components/browse/pager";
import { EXACT_MATCH } from "@/shared/components/browse/active-match";
// Categories are platform data that happens to be fetched under `landing/`.
// Reached through its viewmodel rather than its repository — `ui` may not
// touch `data`, and going through the hook reuses the cache the home page has
// usually already filled.
import {
  CATEGORY_FILTER_LIMIT,
  useCategoryPreview,
} from "@/features/landing/viewmodel/use-categories";
import { useBrowseServices } from "@/features/directory/services/viewmodel/use-browse-services";
// One question about the hearts for the whole page, and the control that
// answers it — see the `useFavouriteMarks` call below for why the page owns
// the query rather than the card.
import { useFavouriteMarks } from "@/features/favourites/viewmodel/use-favourite-marks";
import { FavouriteButton } from "@/features/favourites/ui/favourite-button";
import { SaveToListDialog } from "@/features/favourites/ui/save-to-list-dialog";
import { ServiceCard } from "@/shared/components/browse/service-card";
import {
  MobileServiceFilters,
  ServiceFilters,
  chooseServiceSort,
  serviceSortOptions,
} from "@/features/directory/services/ui/service-filters";
import {
  formatHeadlinePrice,
  servicePriceLine,
} from "@/features/directory/services/domain/service-card";
import {
  BROWSE_PAGE_SIZE,
  type ServiceDTO,
} from "@/features/directory/services/domain/types";
import {
  browseSearch,
  type BrowseSearch,
} from "@/features/directory/services/domain/browse-search";
import { browseTitle } from "@/features/directory/services/domain/browse-title";
import { resultsScope, scopeValues } from "@/features/directory/domain/results-scope";

/**
 * Every published service on the platform.
 *
 * The page a customer arrives on wanting a haircut rather than wanting a
 * particular barber — the commoner arrival, and why Services sits before
 * Providers in the nav.
 *
 * Four levels of narrowing, deliberately not the same shape. The header's own
 * search bar asks the opening question — the same bar in the same place as on
 * every other page, so the question is asked in the same words and the same
 * shape wherever it is asked. What differs is what a submit keeps: from a
 * page with no list under it the term is the whole URL, and here the bar is
 * handed this page's own `browseSearch`, so a typed term keeps the narrowing
 * under it. The category strip is full-width navigation between whole result
 * sets. The pills under the heading narrow one of those sets. The sort
 * reorders what is left. Making all four a row of chips would say they were
 * peers.
 *
 * **Nothing in the results is blue.** The site's one blue goes where the site
 * always puts it — the header's sign-in and the search bar's button — and no
 * further down the page than that. The header's three destinations used to be
 * a third place and are not any more: they are bare text, and the lit one is
 * navy.
 * Everything below is headline navy, ink, grey and the amber star, which is
 * why the cards carry no button of their own: what the eye should land on
 * down a grid of results is the photographs and the prices, not twenty-four
 * identical calls to action.
 *
 * **Two bands, and nothing straddles them.** Header, then `main`: the search
 * band that used to sit between them is inside the header, and the category
 * strip that used to run under it is a pill on the filter bar. Neither band
 * overlaps the next, so there is no paint-order split — anything reintroduced
 * between them on a negative margin would be painted over.
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
  /**
   * Which of the cards on this page the reader has already saved — asked
   * **once, here**, and handed down as a filled or empty heart.
   *
   * Never a hook inside the card: every card would ask the same question, and
   * the heart would cost twenty-four round trips a page instead of one. The
   * query is disabled for a signed-out reader and for an empty page, so this
   * costs nothing at all in either case — see `useFavouriteMarks`.
   */
  const marks = useFavouriteMarks(
    "service",
    page.items.map((item) => item.id),
  );
  /**
   * Which listing the save-to-a-list dialog is about, and what its heart's own
   * save answered with. `null` is closed.
   *
   * The whole DTO rather than an id: the dialog puts the listing on screen —
   * the photograph, the name and the price — and looking it back up by id
   * would be this page searching for a row it is already holding.
   *
   * Held here and not in the card, for the same reason the marks query is:
   * one dialog for the page, never one mounted per result.
   */
  const [filing, setFiling] = useState<{ service: ServiceDTO; listIds?: string[] } | null>(
    null,
  );
  const navigate = useNavigate();
  // A plain query, unlike the services: this is a control, not the content a
  // crawler came for, so it may arrive a beat later.
  const categories = useCategoryPreview(CATEGORY_FILTER_LIMIT).data?.items ?? [];
  const categoryName = categories.find((c) => c.code === category)?.name ?? null;

  const title = browseTitle(current, categoryName);
  const scope = scopeValues(current, categoryName);

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
      {/* The site's search, not a search this page invented, and inside the
          header rather than in a band of its own beneath it: it is the same
          bar on every page, so it belongs to the chrome. What this page hands
          it is what the bar should ask for and what a submit should keep —
          `browseSearch`, like every other control here, which is what holds
          on to the category, the filters, the city and the sort when a term
          is typed, and resets the page. The city is not one of the bar's own
          fields: that is the "City" filter pill below, where a narrowing
          belongs. */}
      <SiteHeader
        current="services"
        search={{
          to: "/services",
          placeholder: t("searchPlaceholder"),
          label: t("searchLabel"),
          search: (q) => browseSearch(current, { q, offset: undefined }),
          initialValue: current.q ?? "",
        }}
      />


      {/* The floating capsule is `fixed` and covers whatever the page ends
          with — which is the pager, so "Next →" was sitting behind it and
          could not be pressed. The root layout's own `pb-14` clears
          `MobileNav` and nothing more; this clears the capsule above it, and
          stops at `lg`, where the capsule is hidden and the pills take over. */}
      <main className="page-shell pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-14">
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
                category above, so reusing `title.values` printed "0 services
                found in all categories" over a search inside a category whose
                chip was lit two lines up. The clause names what is filtering. */}
            <p className="mt-1 text-[14.5px] text-[var(--color-muted-foreground)]">
              <b className="font-semibold text-[var(--color-foreground)]">
                {t("servicesFound", { count: page.total })}
              </b>{" "}
              {t(`resultsScope.${resultsScope(scope)}`, scope)}
            </p>
          </div>

          {/* One sort per width: the phone's copy rides in the floating
              capsule (see `MobileServiceFilters`), so this one is drawn only
              where that capsule is not. Both read the same list and write
              through the same chooser, so they can never come to offer
              different orders. */}
          <SortDropdown
            active={sort}
            options={serviceSortOptions(t)}
            sortLabel={t("sortTrigger")}
            triggerClassName="hidden text-[var(--color-headline)] lg:inline-flex"
            onChoose={chooseServiceSort(navigate, current)}
          />
        </div>

        <ServiceFilters current={current} />

        {/* The phone's two or three narrowings, one tap each, above the results
            they narrow — the pills are a toolbar and a toolbar does not fit a
            thumb. Hidden exactly where the floating capsule is hidden, so a
            reader is never offered both.

            Not drawn over an empty platform: three ways to narrow nothing,
            under a sentence saying nothing is published, offers a reader work
            that cannot help them. They stay on an empty *search*, because
            there they are one tap out of it. */}
        {(page.items.length > 0 || isNarrowed) && (
          <div className="pb-5 lg:hidden">
            <QuickChips label={t("quickChipsLabel")}>
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
                // The amount is money, so it is formatted as money — the same
                // function and the same locale the tiles print their prices
                // with, rather than a bare number the reader has to guess a
                // currency for.
                label={t("quickChipMaxPrice", {
                  amount: formatHeadlinePrice(QUICK_MAX_PRICE * 100, DEFAULT_CURRENCY, locale),
                })}
              />
            </QuickChips>
          </div>
        )}

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
            {/* Four across at `lg`, two at `sm`, one below it. The card is a
                bordered object with its own edge, so — unlike the borderless
                tile it replaces — it is separated from its neighbours by a
                gap at every width, never a hairline: a divider between two
                boxes that already draw their own border would be a third
                separation doing the one job the gap already does. The row
                gap is larger than the column gap on purpose, so equal gaps
                do not read as a grid of unrelated things rather than as
                rows. */}
            <ul className="grid list-none grid-cols-1 gap-x-6 gap-y-8 p-0 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {page.items.map((service) => (
                <li key={service.id}>
                  <ServiceCard
                    service={service}
                    locale={locale}
                    favourite={
                      <FavouriteButton
                        targetType="service"
                        targetId={service.id}
                        saved={marks.isMarked(service.id)}
                        // Fires when the save answers, never on the press:
                        // the lists come from the mutation's own data, so the
                        // dialog opens already knowing which are ticked. A
                        // press on an already-filled heart brings none, and
                        // the dialog asks for itself.
                        onSaved={({ listIds }) =>
                          setFiling({ service, ...(listIds ? { listIds } : {}) })
                        }
                      />
                    }
                  />
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

      {/* Mounted only while it is open, so its focus trap and the return of
          focus to the heart run on mount and unmount rather than off a prop. */}
      {filing && (
        <SaveToListDialog
          open
          onOpenChange={(open) => !open && setFiling(null)}
          targetType="service"
          targetId={filing.service.id}
          listing={serviceListing(filing.service, t, locale)}
          {...(filing.listIds ? { savedListIds: filing.listIds } : {})}
        />
      )}
    </>
  );
}

/**
 * What the dialog draws down its left panel: this service, said the way the
 * card beside it says it.
 *
 * Here rather than in the dialog, which is handed a listing and knows nothing
 * about services: the price is a `ServicePriceLine`, whose amount is either
 * money to format in the reader's locale or a phrase to translate, and that
 * branch belongs where the DTO does. It reads `servicePriceLine` — the same
 * function `ServiceCard` prints from — so the dialog and the card behind it
 * can never come to disagree about what this listing costs.
 */
function serviceListing(service: ServiceDTO, t: TFunction, locale: string) {
  const line = servicePriceLine(service);
  return {
    imageUrl: service.imageUrls[0] ?? null,
    name: service.name,
    byline: service.providerName,
    price:
      line.amount.kind === "words"
        ? t(line.amount.key)
        : formatHeadlinePrice(line.amount.amountMinor, line.amount.currency, locale),
  };
}

/**
 * The currency the phone's price chip is written in.
 *
 * The one price on this page that does not come from data: every amount on a
 * tile carries its own service's currency, and this chip is a threshold the
 * page invents, so it has no row to take one from. Mozambique is a
 * single-currency market and `MZN` is right today; the day a second one is
 * listed, this constant is where the page has to start asking somebody.
 */
const DEFAULT_CURRENCY = "MZN";

/**
 * The ceiling the phone's price chip offers, in whole meticais.
 *
 * One number rather than a range, because a quick filter is one tap: the chip
 * says "Até 1 000 MZN" and taps off again. Whole units, which is what the URL
 * and `PriceRangeFilter`'s own boxes carry — the chip's own label multiplies
 * by 100 for `formatHeadlinePrice`, which speaks minor units like every price
 * on a tile, rather than the two being written out separately and drifting.
 */
const QUICK_MAX_PRICE = 1000;

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
    /* `shrink-0` here as well as on the link: this `<li>` is the flex item
       `QuickChips` lays out, and it is the one that was being squeezed. */
    <li className="shrink-0">
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
