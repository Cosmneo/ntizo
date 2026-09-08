import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Sparkles, icons } from "lucide-react";
import { Skeleton } from "@ntizo/frontend-ui";
import { BrandImage } from "@/shared/components/brand-image";
import { ScrollRail } from "@/shared/components/browse/scroll-rail";
import { useCategoryPreview } from "@/features/landing/viewmodel/use-categories";
import { SectionHead } from "@/features/landing/ui/section-head";

/** How many the home page shows before "all categories". */
export const LANDING_CATEGORIES = 8;

/**
 * Resolve a Lucide icon name from the database to the component.
 *
 * Looked up rather than imported one by one: the set lives in a table an
 * administrator edits, so the code cannot know it at build time. An unknown or
 * missing name falls back to `Sparkles` rather than rendering nothing — an
 * empty navy square says less than a wrong-but-present mark.
 */
function getIconComponent(name: string | null) {
  if (!name) return Sparkles;
  return icons[name as keyof typeof icons] ?? Sparkles;
}

/**
 * Eight trades, each with a picture.
 *
 * A photograph rather than the icon strip `/services` uses. On a browse page a
 * category is a filter and an icon is the right size for it; on a home page it
 * is an invitation, and an invitation with a picture is the difference between
 * this section and the four empty tiles it replaces.
 *
 * A category with no `imageUrl` draws navy and its own icon rather than
 * `BrandImage`'s brand tile: the brand tile prints initials, and a row of
 * eight tiles each printing two letters of its own name is a row of eight
 * near-identical squares.
 *
 * Below `sm` the grid becomes `ScrollRail`'s sideways row. `cardWidth="38%"`
 * lands two tiles on screen at 390px with a clear quarter-tile peek of a
 * third — a small square with one line of text under it reads fine that
 * dense, unlike the two bigger card sections below it on the page.
 */
export function CategoryGrid() {
  const { t } = useTranslation("landing"); // t:CategoryGrid
  const { data, isLoading } = useCategoryPreview(LANDING_CATEGORIES);
  const items = data?.items ?? [];

  if (!isLoading && items.length === 0) return null;

  return (
    <section className="page-shell pt-14">
      <SectionHead
        title={t("home.categoriesTitle")}
        blurb={t("home.categoriesBlurb")}
        more={{ label: t("home.categoriesAll"), to: "/services" }}
      />
      <ScrollRail
        as="ul"
        columns={4}
        cardWidth="38%"
        className="sm:gap-x-4 sm:gap-y-4 xl:grid-cols-8"
      >
        {isLoading
          ? Array.from({ length: LANDING_CATEGORIES }, (_, i) => (
              <li key={i}>
                <Skeleton className="aspect-square w-full rounded-2xl" />
                <Skeleton className="mx-auto mt-2.5 h-[17px] w-16" />
              </li>
            ))
          : items.map((c) => {
              const Icon = getIconComponent(c.icon);
              const isFallback = !c.icon || !icons[c.icon as keyof typeof icons];
              return (
                <li key={c.id}>
                  <Link
                    to="/services"
                    search={{ category: c.code }}
                    className="group block"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-[var(--color-navy-surface)]">
                      <BrandImage
                        src={c.imageUrl}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                        fallback={
                          <span className="grid h-full w-full place-items-center">
                            <Icon
                              data-testid={isFallback ? "category-icon-fallback" : `category-icon-${c.icon}`}
                              className="h-9 w-9 text-[var(--color-navy-on)]"
                              strokeWidth={1.4}
                              aria-hidden="true"
                            />
                          </span>
                        }
                      />
                    </div>
                    <b className="mt-2.5 block truncate text-center text-sm font-semibold group-hover:underline group-hover:underline-offset-[3px]">
                      {c.name}
                    </b>
                  </Link>
                </li>
              );
            })}
      </ScrollRail>
    </section>
  );
}
