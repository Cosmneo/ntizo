import { useTranslation } from "react-i18next";
import { Skeleton } from "@ntizo/frontend-ui";
import { ServiceTile } from "@/features/directory/services/ui/service-tile";
import { usePopularServices } from "@/features/landing/viewmodel/use-popular-services";
import { useLocale } from "@/features/landing/viewmodel/use-locale";
import { SectionHead } from "@/features/landing/ui/section-head";

/** How many services the home page leads with. */
export const LANDING_SERVICES = 8;

/**
 * The services, with their prices.
 *
 * This section used to be called "popular services" and show three
 * *providers*, with no price on any of them — so the home page of a
 * marketplace whose whole promise is a fixed price never showed one.
 *
 * `ServiceTile` is the browse's own component, imported rather than
 * reimplemented. One price treatment, one hover, one empty state, and a change
 * to how a service looks happens once.
 */
export function PopularServices() {
  const { t } = useTranslation("landing"); // t:PopularServices
  const locale = useLocale();
  const { data, isLoading } = usePopularServices(LANDING_SERVICES);
  const items = data?.items ?? [];

  // Nothing published, so the section does not appear. A heading over an empty
  // grid says the platform sells nothing.
  if (!isLoading && items.length === 0) return null;

  return (
    <section className="page-shell pt-14">
      <SectionHead
        title={t("home.servicesTitle")}
        blurb={t("home.servicesBlurb")}
        more={{ label: t("home.servicesAll"), to: "/services" }}
      />
      {/* `ServiceTile` wraps `ResultTile`, which is two shapes: a photo-left
          hairline row below `sm`, and the desktop's photo-above-text tile
          from `sm` up. A plain `gap` grid gives it neither below `sm` — the
          row keeps its own vertical padding but nothing separates one row
          from the next — so this matches `/services`' own list: no column
          gap and a `divide-y` hairline below `sm`, the grid gap back once
          the tile changes shape. */}
      <ul className="grid list-none grid-cols-1 gap-0 divide-y divide-[var(--color-border)] p-0 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-7 sm:divide-y-0 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: LANDING_SERVICES }, (_, i) => (
              <li key={i}>
                {/* The same responsive shape as the tile it stands in for —
                    a 116px square beside two bars below `sm`, a wide photo
                    above them from `sm` up — so a cold load does not
                    reflow the moment the real tile replaces it. */}
                <div className="grid grid-cols-[116px_minmax(0,1fr)] gap-3.5 py-3.5 sm:block sm:py-0">
                  <Skeleton className="aspect-square w-full rounded-[12px] sm:aspect-[4/3] sm:rounded-[var(--radius-card)]" />
                  <div className="grid gap-[3px] pt-2.5">
                    <Skeleton className="h-[17px] w-2/3" />
                    <Skeleton className="h-[15px] w-1/2" />
                  </div>
                </div>
              </li>
            ))
          : items.map((s) => (
              <li key={s.id}>
                <ServiceTile service={s} locale={locale} />
              </li>
            ))}
      </ul>
    </section>
  );
}
