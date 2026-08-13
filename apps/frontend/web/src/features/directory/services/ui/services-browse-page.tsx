import { useTranslation } from "react-i18next";
import { Link, useSearch } from "@tanstack/react-router";
import { cn } from "@ntizo/frontend-ui";
import { SiteHeader } from "@/shared/components/site-header";
// Categories are platform data that happens to be fetched under `landing/`.
// Reached through its viewmodel rather than its repository — `ui` may not
// touch `data`, and going through the hook reuses the cache the home page has
// usually already filled.
import { useCategoryPreview } from "@/features/landing/viewmodel/use-categories";
import { useBrowseServices } from "@/features/directory/services/viewmodel/use-browse-services";
import { BrowseServiceCard } from "@/features/directory/services/ui/browse-service-card";
import { BROWSE_PAGE_SIZE } from "@/features/directory/services/domain/types";

/**
 * Every published service on the platform.
 *
 * The page a customer arrives on wanting a haircut rather than wanting a
 * particular barber — which is the commoner arrival, and why this sits before
 * the provider directory in the nav.
 *
 * Paging is `nextOffset` from the server and never `items.length`. A row
 * dropped for being unpublished, for its provider going inactive, or for
 * having no readable name still occupied a position in the underlying order;
 * advancing by the shorter number would fetch it again forever. The
 * projection's own comment says so, and this is the caller it is warning.
 *
 * Offset lives in the URL, like the directory's `?q=`: a results page you
 * cannot link to or reload is not a results page, and it is what carries the
 * value into the loader so page two is server-rendered like page one.
 */
export function ServicesBrowsePage() {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  // `strict: false` so this component stays usable outside its own route and
  // testable without one; the route validates before it reaches here.
  const { category, offset = 0 } = useSearch({ strict: false }) as {
    category?: string;
    offset?: number;
  };
  const page = useBrowseServices(category, offset);
  // A plain query, unlike the services above: this is the filter control, not
  // the content a crawler came for, so it may arrive a beat later.
  const categories = useCategoryPreview(CATEGORY_FILTER_LIMIT).data?.items ?? [];

  return (
    <>
      <SiteHeader current="services" />
      <main className="page-shell py-12">
        <h1 className="text-3xl font-semibold">{t("servicesTitle")}</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">{t("servicesSubtitle")}</p>

        {/* Chips rather than a dropdown: the set is small, each member has a
            name worth reading, and a filter you can see the state of is one
            you remember having set. "All" is a chip too — clearing a filter
            should not need a different gesture from setting one.

            Every link resets `offset`. Page three of plumbing is not page
            three of cleaning, and carrying the offset across a filter change
            lands on an empty page that looks like an empty category. */}
        {categories.length > 0 && (
          <nav className="mt-8 flex flex-wrap gap-2" aria-label={t("servicesFilterByCategory")}>
            <CategoryChip label={t("servicesAllCategories")} active={!category} />
            {categories.map((c) => (
              <CategoryChip key={c.id} label={c.name} code={c.code} active={category === c.code} />
            ))}
          </nav>
        )}

        {page.items.length === 0 ? (
          <p className="mt-10 text-[var(--color-muted-foreground)]">{t("servicesEmpty")}</p>
        ) : (
          <>
            <ul className="mt-6 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {page.items.map((service) => (
                <BrowseServiceCard key={service.id} service={service} locale={locale} />
              ))}
            </ul>

            {/* Links, not buttons: the same reason the cards are. Back appears
                only off the first page, and forward only when the server says
                there is one — `nextOffset` is null at the end, which is a
                fact the client has no other way to know. */}
            <nav className="mt-10 flex items-center justify-between gap-3">
              {offset > 0 ? (
                <Link
                  to="/services"
                  search={{
                    ...(category ? { category } : {}),
                    ...(offset - BROWSE_PAGE_SIZE > 0
                      ? { offset: offset - BROWSE_PAGE_SIZE }
                      : {}),
                  }}
                  className="type-body font-semibold text-[var(--color-primary)] hover:underline"
                >
                  {t("servicesPrevious")}
                </Link>
              ) : (
                <span />
              )}
              {page.nextOffset !== null ? (
                <Link
                  to="/services"
                  search={{
                    ...(category ? { category } : {}),
                    offset: page.nextOffset,
                  }}
                  className="type-body font-semibold text-[var(--color-primary)] hover:underline"
                >
                  {t("servicesNext")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </>
        )}
      </main>
    </>
  );
}

/**
 * How many categories the filter row offers.
 *
 * The same page size the category browse uses, so the two ask for the same
 * set and share a cache entry rather than fetching overlapping halves.
 */
const CATEGORY_FILTER_LIMIT = 24;

/**
 * One category in the filter row.
 *
 * A `Link`, so a filtered list is a URL somebody can send. Omitting `code`
 * makes it the "all" chip — the absence of the search param, not a magic
 * value, which keeps `/services` and `/services?category=` from being two
 * spellings of the same page.
 */
function CategoryChip({
  label,
  code,
  active,
}: {
  label: string;
  code?: string;
  active: boolean;
}) {
  return (
    <Link
      to="/services"
      search={code ? { category: code } : {}}
      className={cn(
        "type-caption rounded-full border px-3.5 py-1.5 transition-colors",
        active
          ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] font-semibold text-[var(--color-primary)]"
          : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
      )}
    >
      {label}
    </Link>
  );
}
