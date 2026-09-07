import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Brush,
  Camera,
  Car,
  ChefHat,
  Hammer,
  Leaf,
  Scissors,
  Shirt,
  Sparkles,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@ntizo/frontend-ui";
import { useCategoryPreview } from "@/features/landing/viewmodel/use-categories";
import { SectionHead } from "@/features/landing/ui/section-head";

/** How many the home page shows before "all categories". */
export const LANDING_CATEGORIES = 8;

/**
 * The icon a category draws when it has no photograph.
 *
 * Keyed on the `icon` the administrator set. A category with none, or with a
 * name this map has never heard of, draws `Sparkles` — one shape rather than
 * nothing, because an empty navy square says less than a wrong-but-present
 * mark.
 */
const ICONS: Record<string, LucideIcon> = {
  scissors: Scissors,
  wrench: Wrench,
  zap: Zap,
  sparkles: Sparkles,
  car: Car,
  chef: ChefHat,
  hammer: Hammer,
  leaf: Leaf,
  camera: Camera,
  shirt: Shirt,
  brush: Brush,
};

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
      <ul className="grid grid-cols-4 gap-x-4 gap-y-4 sm:gap-x-4 xl:grid-cols-8">
        {isLoading
          ? Array.from({ length: LANDING_CATEGORIES }, (_, i) => (
              <li key={i}>
                <Skeleton className="aspect-square w-full rounded-2xl" />
                <Skeleton className="mx-auto mt-2.5 h-[17px] w-16" />
              </li>
            ))
          : items.map((c) => {
              const Icon = (c.icon && ICONS[c.icon]) ?? null;
              return (
                <li key={c.id}>
                  <Link
                    to="/services"
                    search={{ category: c.code }}
                    className="group block"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-[var(--color-navy-surface)]">
                      {c.imageUrl ? (
                        <img
                          src={c.imageUrl}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center">
                          {Icon ? (
                            <Icon
                              data-testid={`category-icon-${c.icon}`}
                              className="h-9 w-9 text-[var(--color-navy-on)]"
                              strokeWidth={1.4}
                              aria-hidden="true"
                            />
                          ) : (
                            <Sparkles
                              data-testid="category-icon-fallback"
                              className="h-9 w-9 text-[var(--color-navy-on)]"
                              strokeWidth={1.4}
                              aria-hidden="true"
                            />
                          )}
                        </span>
                      )}
                    </div>
                    <b className="mt-2.5 block truncate text-center text-sm font-semibold group-hover:underline group-hover:underline-offset-[3px]">
                      {c.name}
                    </b>
                  </Link>
                </li>
              );
            })}
      </ul>
    </section>
  );
}
