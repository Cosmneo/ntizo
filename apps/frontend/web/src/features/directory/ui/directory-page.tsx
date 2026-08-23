import { Link, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SearchX, Store } from "lucide-react";
import { useDirectory } from "@/features/directory/viewmodel/use-directory";
import { useAllCategories } from "@/features/landing/viewmodel/use-categories";
import {
  directorySearch,
  type DirectorySearch,
} from "@/features/directory/domain/directory-search";
import { DIRECTORY_PAGE_SIZE } from "@/features/directory/domain/provider-listing";
import { DirectoryCategoryBand } from "@/features/directory/ui/directory-category-band";
import {
  DirectoryFilters,
  MobileDirectoryFilterBar,
} from "@/features/directory/ui/directory-filters";
import { DirectorySort } from "@/features/directory/ui/directory-sort";
import { ProviderCard } from "@/features/directory/ui/provider-card";
import { EmptyCard } from "@/shared/components/empty-card";
import { SiteHeader } from "@/shared/components/site-header";

/**
 * The public provider directory.
 *
 * Laid out as the services browse is — category band across the top, filters in
 * a column, results beside them — because they are the platform's two browse
 * surfaces, and a reader who has learned one should not have to learn the
 * other. What they show differs: a service card sells one job, a provider card
 * is a business somebody is deciding whether to trust, so it carries the score,
 * the verification and the trades rather than a duration.
 *
 * The screen this replaces had no filters, no sort, no paging controls, and its
 * cards were not links — the directory could be read but not used, and there
 * was no way to reach a provider from it at all.
 *
 * `useSuspenseQuery` under `useDirectory`, not `useQuery`: this page is
 * server-rendered so a crawler finds the listings in the HTML. A plain
 * `useQuery` would render its loading state on the server and ship a page with
 * no content in it — which is the one outcome a page built to rank must not
 * have.
 */
export function DirectoryPage() {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  // `strict: false` so this component stays usable outside its own route (and
  // testable without one); the route validates every parameter before it gets
  // here.
  const current = useSearch({ strict: false }) as DirectorySearch;

  // `items` are the rows this page shows; `total` is how many matched. The
  // results line states the second — with a page size of 20, counting the rows
  // told somebody with 40 matches that they had 20.
  const { items: providers, total } = useDirectory(current, locale);
  const categories = useAllCategories().data?.pages.flatMap((p) => p.items) ?? [];

  /**
   * Whether anything is narrowing the list.
   *
   * Decides which empty state to draw, and it has to name every filter: an
   * empty result under a city filter is "nothing matches", and telling that
   * reader the platform has no businesses is simply false.
   */
  const isNarrowed =
    Boolean(current.q || current.category || current.city || current.providerType) ||
    current.minRating != null ||
    current.verified === true ||
    // Checked separately: a minimum of 0 is a narrowing the reader set, and
    // `??` would step over it as though they had set nothing.
    current.minPrice != null ||
    current.maxPrice != null;

  const offset = current.offset ?? 0;
  const nextOffset = offset + DIRECTORY_PAGE_SIZE;

  return (
    <>
      <SiteHeader current="providers" />

      <DirectoryCategoryBand
        categories={categories}
        current={current}
        allLabel={t("providersAllCategories")}
        label={t("providersFilterByCategory")}
      />

      <main className="page-shell py-8">
        <div className="max-w-3xl">
          <h1 className="type-h1">{t("title")}</h1>
          <p className="type-body mt-2 text-[var(--color-muted-foreground)]">{t("subtitle")}</p>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-start">
          <DirectoryFilters current={current} />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="type-body text-[var(--color-muted-foreground)]">
                {t("providersFound", { count: total })}
              </p>
              <DirectorySort current={current} />
            </div>

            {providers.length === 0 ? (
              // Two different sentences, because they are two different
              // situations. An empty platform is "nobody has joined yet"; an
              // empty search is "nothing matches", and telling a reader who
              // filtered that the platform is empty is false. Only the first is
              // an empty list, so only the first carries the brand mark.
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
                <ul className="mt-5 grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {providers.map((p) => (
                    <ProviderCard key={p.id} provider={p} />
                  ))}
                </ul>

                {/* Links, not buttons: a page of the directory is a URL, and
                    the back button should walk back through the pages. Each
                    side is drawn only where there is somewhere to go. */}
                <nav className="mt-8 flex items-center justify-between gap-3">
                  {offset > 0 ? (
                    <PageLink
                      current={current}
                      offset={Math.max(0, offset - DIRECTORY_PAGE_SIZE)}
                      label={t("providersPrevious")}
                    />
                  ) : (
                    <span />
                  )}
                  {nextOffset < total ? (
                    <PageLink current={current} offset={nextOffset} label={t("providersNext")} />
                  ) : (
                    <span />
                  )}
                </nav>
              </>
            )}
          </div>
        </div>
      </main>

      <MobileDirectoryFilterBar current={current} />
    </>
  );
}


function PageLink({
  current,
  offset,
  label,
}: {
  current: DirectorySearch;
  offset: number;
  label: string;
}) {
  return (
    <Link
      to="/providers"
      search={directorySearch(current, { offset })}
      className="type-body-medium rounded-[var(--radius-field)] border border-[var(--color-border)] px-4 py-2 transition-colors hover:bg-[var(--color-muted)]"
    >
      {label}
    </Link>
  );
}
