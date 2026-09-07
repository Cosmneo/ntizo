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
      <ul className="grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: LANDING_SERVICES }, (_, i) => (
              <li key={i}>
                <Skeleton className="aspect-[4/3] w-full rounded-[var(--radius-card)]" />
                <Skeleton className="mt-2.5 h-[17px] w-2/3" />
                <Skeleton className="mt-1.5 h-[15px] w-1/2" />
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
