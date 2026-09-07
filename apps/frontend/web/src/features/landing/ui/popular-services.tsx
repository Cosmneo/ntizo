import { useTranslation } from "react-i18next";
import { Skeleton } from "@ntizo/frontend-ui";
import { ServiceCard } from "@/shared/components/browse/service-card";
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
 * It shows the shared `ServiceCard` — a bordered, photo-on-top shape the
 * client asked for here first and then asked to see everywhere: `/services`'
 * own grid now draws the same component rather than its old borderless
 * `ServiceTile`.
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
      <ul className="grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: LANDING_SERVICES }, (_, i) => (
              <li key={i}>
                {/* The same shape as the card it stands in for: a full-bleed
                    photo, then a padded body with a byline, a title and a
                    bottom row, so a cold load does not reflow the moment the
                    real card replaces it. */}
                <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
                  <Skeleton className="aspect-[4/3] w-full rounded-none" />
                  <div className="grid gap-2 p-4">
                    <Skeleton className="h-[13px] w-1/3" />
                    <Skeleton className="h-[17px] w-4/5" />
                    <Skeleton className="mt-2 h-[15px] w-2/3" />
                  </div>
                </div>
              </li>
            ))
          : items.map((s) => (
              <li key={s.id}>
                <ServiceCard service={s} locale={locale} />
              </li>
            ))}
      </ul>
    </section>
  );
}
