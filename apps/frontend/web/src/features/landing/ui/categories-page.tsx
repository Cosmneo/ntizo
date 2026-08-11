import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Button, Skeleton } from "@ntizo/frontend-ui";
import { SiteHeader } from "@/shared/components/site-header";
import { SurfaceArt } from "@/features/landing/ui/surface-art";
import { useAllCategories } from "@/features/landing/viewmodel/use-categories";

/** Placeholders while the first page is in flight, and while the next one is. */
const SKELETONS = 8;

/**
 * Every category, loaded as the page is scrolled.
 *
 * The home page shows four; this is where "see all" goes. Pages of 24 rather
 * than the whole table in one response: the list is meant to grow, and a page
 * that fetches everything and calls the result infinite scroll is a page that
 * gets slower every time somebody adds a category.
 */
export function CategoriesPage() {
  const { t } = useTranslation("landing");
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useAllCategories();

  const sentinel = useRef<HTMLDivElement>(null);

  const loadedPages = data?.pages.length ?? 0;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void fetchNextPage();
      },
      // Fetches before the sentinel is on screen, so the next row is usually
      // already there by the time the reader reaches it.
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // `loadedPages` is what keeps this going, and it is not decoration. An
    // IntersectionObserver reports *transitions*: it fires when the sentinel
    // comes into view and then stays quiet while it remains there. With a
    // generous rootMargin the sentinel never leaves, so one long-lived
    // observer loads exactly one extra page and then stalls — measured in a
    // visible tab, four tiles became eight and stopped with two pages still to
    // fetch. Rebuilding after each page re-runs the initial check, which fires
    // again while the sentinel is still in view and goes quiet by itself once
    // `hasNextPage` is false.
  }, [hasNextPage, isFetchingNextPage, loadedPages, fetchNextPage]);

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <SiteHeader current="categories" />
      <main className="page-shell py-12">
        <h1 className="text-3xl font-semibold">{t("categoriesTitle")}</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          {t("categoriesBlurb")}
        </p>

        {error && (
          <p className="mt-8 text-[var(--color-destructive)]">
            {t("categoriesError")}
          </p>
        )}

        <ul className="mt-8 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((cat, i) => (
            <li key={cat.id}>
              <Link to="/providers" className="group block">
                {cat.imageUrl ? (
                  <img
                    src={cat.imageUrl}
                    alt=""
                    className="aspect-[16/11] w-full rounded-2xl object-cover outline-offset-2 group-hover:outline-2 group-hover:outline-[color:var(--color-primary)]"
                  />
                ) : (
                  // Seeded by position so a tile keeps its pattern between
                  // visits, and so two categories side by side never get the
                  // same one.
                  <SurfaceArt
                    seed={i + 1}
                    className="aspect-[16/11] w-full rounded-2xl outline-offset-2 group-hover:outline-2 group-hover:outline-[color:var(--color-primary)]"
                  />
                )}
                <b className="font-rounded mt-3 block text-sm font-bold">
                  {cat.name}
                </b>
                {cat.description && (
                  <span className="mt-0.5 block text-xs text-[var(--color-muted-foreground)]">
                    {cat.description}
                  </span>
                )}
              </Link>
            </li>
          ))}

          {(isLoading || isFetchingNextPage) &&
            Array.from({ length: SKELETONS }, (_, i) => (
              <li key={`skeleton-${i}`}>
                <Skeleton className="aspect-[16/11] w-full rounded-2xl" />
                <Skeleton className="mt-3 h-[17px] w-24" />
              </li>
            ))}
        </ul>

        {!isLoading && items.length === 0 && !error && (
          <p className="mt-10 text-[var(--color-muted-foreground)]">
            {t("categoriesEmpty")}
          </p>
        )}

        {/* The sentinel and a real button. Scrolling alone is not a control:
            it cannot be reached by keyboard, and an observer does not run in a
            background tab — a page whose only way forward is a scroll event
            has no way forward for anybody those two describe. */}
        <div ref={sentinel} className="h-px" aria-hidden="true" />
        {hasNextPage && (
          <div className="mt-10 flex justify-center">
            <Button
              type="button"
              variant="outline"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {t("categoriesLoadMore")}
            </Button>
          </div>
        )}
      </main>
    </>
  );
}
