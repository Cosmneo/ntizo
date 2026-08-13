import { useTranslation } from "react-i18next";
import { Link, useSearch } from "@tanstack/react-router";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { SiteHeader } from "@/shared/components/site-header";
// Categories are platform data that happens to be fetched under `landing/`.
// Reached through its viewmodel rather than its repository — `ui` may not
// touch `data`, and going through the hook reuses the cache the home page has
// usually already filled.
import { useCategoryPreview } from "@/features/landing/viewmodel/use-categories";
import { useBrowseServices } from "@/features/directory/services/viewmodel/use-browse-services";
import { BrowseServiceCard } from "@/features/directory/services/ui/browse-service-card";
import { CategoryBand } from "@/features/directory/services/ui/category-band";
import { BrowseFilters } from "@/features/directory/services/ui/browse-filters";
import { BROWSE_PAGE_SIZE, type BrowseSort } from "@/features/directory/services/domain/types";

/**
 * Every published service on the platform.
 *
 * The page a customer arrives on wanting a haircut rather than wanting a
 * particular barber — the commoner arrival, and why Services sits before
 * Providers in the nav.
 *
 * Three levels of narrowing, deliberately not the same shape. The category
 * band is full-bleed navigation between whole result sets. The sidebar
 * narrows one of those sets. The sort reorders what is left. Making all three
 * a row of chips would say they were peers.
 *
 * Paging is `nextOffset` from the server and never `items.length`: a row
 * dropped for being unpublished still occupied a position in the underlying
 * order, and advancing by the shorter number would fetch it again forever.
 */
export function ServicesBrowsePage() {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  // `strict: false` so this component stays usable outside its own route and
  // testable without one; the route validates before it reaches here.
  const {
    category,
    locationType,
    sort,
    offset = 0,
  } = useSearch({ strict: false }) as {
    category?: string;
    locationType?: string;
    sort?: BrowseSort;
    offset?: number;
  };
  const page = useBrowseServices({ category, locationType, sort, offset });
  // A plain query, unlike the services: this is a control, not the content a
  // crawler came for, so it may arrive a beat later.
  const categories = useCategoryPreview(CATEGORY_BAND_LIMIT).data?.items ?? [];

  /** Everything currently narrowing the list, for building a link that changes one thing. */
  const narrowing = {
    ...(category ? { category } : {}),
    ...(locationType ? { locationType } : {}),
  };

  return (
    <>
      <SiteHeader current="services" />

      <CategoryBand
        categories={categories}
        active={category}
        allLabel={t("servicesAllCategories")}
        label={t("servicesFilterByCategory")}
      />

      <main className="page-shell py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:items-start">
          <BrowseFilters category={category} locationType={locationType} />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="type-body text-[var(--color-muted-foreground)]">
                {t("servicesFound", { count: page.items.length })}
              </p>
              {/* Two links, not a dropdown. There are two orders and both fit
                  on a line; a menu to choose between two things is a click
                  spent hiding one of them. */}
              <nav className="flex items-center gap-1" aria-label={t("sortLabel")}>
                <ArrowUpDown
                  className="h-4 w-4 text-[var(--color-muted-foreground)]"
                  aria-hidden="true"
                />
                <SortLink narrowing={narrowing} active={!sort} label={t("sortDefault")} />
                <SortLink
                  narrowing={narrowing}
                  value="newest"
                  active={sort === "newest"}
                  label={t("sortNewest")}
                />
              </nav>
            </div>

            {page.items.length === 0 ? (
              <p className="mt-10 text-[var(--color-muted-foreground)]">{t("servicesEmpty")}</p>
            ) : (
              <>
                <ul className="mt-5 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
                  {page.items.map((service) => (
                    <BrowseServiceCard key={service.id} service={service} locale={locale} />
                  ))}
                </ul>

                {/* Back appears only off the first page, forward only when the
                    server says there is one — `nextOffset` is null at the end,
                    which the client has no other way to know. */}
                <nav className="mt-10 flex items-center justify-between gap-3">
                  {offset > 0 ? (
                    <PageLink
                      narrowing={{ ...narrowing, ...(sort ? { sort } : {}) }}
                      offset={offset - BROWSE_PAGE_SIZE}
                      label={t("servicesPrevious")}
                    />
                  ) : (
                    <span />
                  )}
                  {page.nextOffset !== null ? (
                    <PageLink
                      narrowing={{ ...narrowing, ...(sort ? { sort } : {}) }}
                      offset={page.nextOffset}
                      label={t("servicesNext")}
                    />
                  ) : (
                    <span />
                  )}
                </nav>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * How many categories the band offers.
 *
 * The same page size the category browse uses, so the two ask for one set and
 * share a cache entry rather than fetching overlapping halves.
 */
const CATEGORY_BAND_LIMIT = 24;

/** Changing the order keeps every filter and resets the page. */
function SortLink({
  narrowing,
  value,
  active,
  label,
}: {
  narrowing: Record<string, string>;
  value?: BrowseSort;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      to="/services"
      search={{ ...narrowing, ...(value ? { sort: value } : {}) }}
      className={cn(
        "type-caption rounded-full px-2.5 py-1 transition-colors",
        active
          ? "bg-[var(--color-muted)] font-semibold text-[var(--color-foreground)]"
          : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
      )}
    >
      {label}
    </Link>
  );
}

/** Paging keeps every filter and the order — only the offset moves. */
function PageLink({
  narrowing,
  offset,
  label,
}: {
  narrowing: Record<string, string>;
  offset: number;
  label: string;
}) {
  return (
    <Link
      to="/services"
      search={{ ...narrowing, ...(offset > 0 ? { offset } : {}) }}
      className="type-body font-semibold text-[var(--color-primary)] hover:underline"
    >
      {label}
    </Link>
  );
}
