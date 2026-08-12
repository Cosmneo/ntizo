import { useTranslation } from "react-i18next";
import { Skeleton } from "@ntizo/frontend-ui";
import { useProviderServices } from "@/features/directory/services/viewmodel/use-provider-services";
import { ServiceCard } from "@/features/directory/services/ui/service-card";

/**
 * A provider's published services, on their public page.
 *
 * A section rather than the whole page's own loading state: the provider's
 * name and description are what `provider-detail-page.tsx` renders from its
 * own, already-resolved data — this fetches separately and degrades on its
 * own, so a slow or failing services request never blanks the page around
 * it.
 */
export function ProviderServicesSection({
  providerId,
  providerImageUrl,
  locale,
}: {
  providerId: string;
  providerImageUrl: string | null;
  locale: string;
}) {
  const { t } = useTranslation("directory");
  const { data, isPending, isError } = useProviderServices(providerId);
  const items = data?.items ?? [];

  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold">{t("servicesTitle")}</h2>

      {isError ? (
        <p className="mt-3 text-[var(--color-destructive)]">
          {t("servicesError")}
        </p>
      ) : !isPending && items.length === 0 ? (
        <p className="mt-3 text-[var(--color-muted-foreground)]">
          {t("servicesEmpty")}
        </p>
      ) : (
        <ul className="mt-6 grid list-none gap-4 p-0 sm:grid-cols-2">
          {isPending
            ? Array.from({ length: 3 }, (_, i) => (
                <ServiceCardSkeleton key={i} />
              ))
            : items.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  providerImageUrl={providerImageUrl}
                  locale={locale}
                />
              ))}
        </ul>
      )}
    </section>
  );
}

function ServiceCardSkeleton() {
  return (
    <li className="overflow-hidden rounded-lg border border-[var(--color-border)]">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="mt-2 h-4 w-1/2" />
      </div>
    </li>
  );
}
