import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LayoutGrid } from "lucide-react";
import { Skeleton } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import { AvailabilitySheet } from "@/features/directory/availability/ui/availability-sheet";
import { useProviderServices } from "@/features/directory/services/viewmodel/use-provider-services";
import { ServiceCard } from "@/features/directory/services/ui/service-card";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

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
  const [selectedService, setSelectedService] = useState<ServiceDTO | null>(null);

  return (
    <section className="mt-12">
      <h2 className="type-h2">{t("servicesTitle")}</h2>

      {isError ? (
        <p className="mt-3 text-[var(--color-destructive)]">
          {t("servicesError")}
        </p>
      ) : !isPending && items.length === 0 ? (
        <EmptyCard
          compact
          badge={LayoutGrid}
          title={t("providerServicesEmptyTitle")}
          body={t("providerServicesEmpty")}
        />
      ) : (
        // Four across on a wide screen, not two. Two columns of a 4:3 image on
        // a 1320px page is a 600px card with a 450px photograph of one haircut
        // — the provider's whole catalogue pushed below the fold by its own
        // illustrations. The same grid the services browse uses, so a card
        // means the same size on both pages.
        <ul className="mt-6 grid list-none items-start gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isPending
            ? Array.from({ length: 4 }, (_, i) => (
                <ServiceCardSkeleton key={i} />
              ))
            : items.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  providerImageUrl={providerImageUrl}
                  locale={locale}
                  onSelect={setSelectedService}
                />
              ))}
        </ul>
      )}

      {/* Keyed by id and only ever mounted while a service is selected, so
          every piece of the sheet's own local state (the selected week, day,
          member, time…) starts fresh each time — see that component's own
          doc comment for why this makes a reset effect unnecessary. */}
      {selectedService && (
        <AvailabilitySheet
          key={selectedService.id}
          service={selectedService}
          open
          onOpenChange={(open) => {
            if (!open) setSelectedService(null);
          }}
        />
      )}
    </section>
  );
}

function ServiceCardSkeleton() {
  return (
    <li className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <Skeleton className="aspect-[3/2] w-full rounded-none" />
      <div className="p-3.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-3 w-1/2" />
      </div>
    </li>
  );
}
