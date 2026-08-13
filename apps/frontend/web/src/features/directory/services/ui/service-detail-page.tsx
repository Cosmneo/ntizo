import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Button } from "@ntizo/frontend-ui";
import type { ServiceDetailDTO } from "@ntizo/shared/read-models";
import { SiteHeader } from "@/shared/components/site-header";
import { EmptyCard } from "@/shared/components/empty-card";
import { PackageX } from "lucide-react";
import { useServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";
import { ServiceGallery } from "@/features/directory/services/ui/service-gallery";
import { ServiceProviderCard } from "@/features/directory/services/ui/service-provider-card";
import { ServicePerformers } from "@/features/directory/services/ui/service-performers";
import { PackageChooser } from "@/features/directory/services/ui/package-chooser";
import { ServiceQuoteNotice } from "@/features/directory/services/ui/service-quote-notice";
import { AvailabilitySheet } from "@/features/directory/availability/ui/availability-sheet";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

/**
 * `AvailabilitySheet` (and the calendar components it composes) was built for
 * `services-section.tsx`, which hands it the browse card's own `ServiceDTO` —
 * `defaultOption`, `fromAmountMinor`, `optionCount`. This page fetches the
 * fuller `ServiceDetailDTO` instead, whose `options` is the complete,
 * cheapest-first list rather than one server-resolved default. Same
 * underlying facts, a different shape for a different question ("what can a
 * card show" versus "what can a chooser offer"), so this adapts one to the
 * other here rather than widening `AvailabilitySheet`'s own prop — the design
 * spec keeps that component, `DateStrip`, `TimeGrid` and `MemberPicker`
 * unchanged apart from the picker's own labels.
 */
function toAvailabilityService(service: ServiceDetailDTO): ServiceDTO {
  const cheapest = service.options[0] ?? null;
  const defaultOption = service.options.find((o) => o.isDefault) ?? cheapest;
  return {
    id: service.id,
    providerId: service.providerId,
    providerName: service.providerName,
    providerSlug: service.providerSlug,
    providerType: service.providerType,
    categoryCode: service.categoryCode,
    categoryName: service.categoryName,
    name: service.name,
    description: service.description,
    locationType: service.locationType,
    bookingMode: service.bookingMode,
    imageUrls: service.imageUrls,
    defaultOption: defaultOption
      ? {
          amountMinor: defaultOption.amountMinor,
          currency: defaultOption.currency,
          durationMinutes: defaultOption.durationMinutes,
          minMinutes: defaultOption.minMinutes,
          stepMinutes: defaultOption.stepMinutes,
          pricingMode: defaultOption.pricingMode,
        }
      : null,
    fromAmountMinor: cheapest?.amountMinor ?? null,
    optionCount: service.options.length,
    isFallback: service.isFallback,
  };
}

/**
 * One service, in full.
 *
 * Two columns on a wide screen: what the service is on the left, what it costs
 * and when it can happen on the right. The right column is what the reader
 * came to act on, so it is the one that stays in view as the left one scrolls.
 */
export function ServiceDetailPage({ id }: { id: string }) {
  const { t, i18n } = useTranslation("directory");
  const service = useServiceDetail(id);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  if (!service) {
    return (
      <>
        <SiteHeader current="services" />
        <main className="page-shell py-12">
          <EmptyCard
            framed
            badge={PackageX}
            title={t("serviceNotFoundTitle")}
            body={t("serviceNotFoundBody")}
            action={
              <Link
                to="/services"
                className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                {t("serviceNotFoundAction")}
              </Link>
            }
          />
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader current="services" />
      <main className="page-shell py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
          <div className="min-w-0">
            <ServiceGallery images={service.imageUrls} alt={service.name} />
            <h1 className="type-h1 mt-6">{service.name}</h1>
            <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
              {[service.categoryName, service.providerCity].filter(Boolean).join(" · ")}
            </p>
            {service.description && (
              <p className="type-body mt-6 whitespace-pre-line">{service.description}</p>
            )}
            <ServicePerformers performers={service.performers} />
          </div>
          <div className="grid gap-4 lg:sticky lg:top-4">
            {service.options.length === 0 ? (
              // A quote service has nothing to check a calendar against yet —
              // no price is fixed until the provider has seen the job, so
              // there is no slot to offer a time for. `ServiceQuoteNotice`
              // already carries the one sentence that explains this
              // (`availabilityQuoteNotice`, the same key `AvailabilitySheet`
              // itself falls back to for the identical fact); a "see
              // availability" button that opened the sheet only to repeat
              // that sentence would say the same thing to the reader twice.
              <ServiceQuoteNotice />
            ) : (
              <>
                <PackageChooser key={service.id} options={service.options} locale={locale} />
                <Button type="button" className="w-full" onClick={() => setAvailabilityOpen(true)}>
                  {t("availabilityCheckAction")}
                </Button>
              </>
            )}
            <ServiceProviderCard service={service} />
          </div>
        </div>

        {/* Keyed by id and only ever mounted while open, so every piece of
            the sheet's own local state (the selected week, day, member,
            time…) starts fresh each time — the same reason
            `services-section.tsx` keys its own mount by the selected
            service's id. */}
        {availabilityOpen && (
          <AvailabilitySheet
            key={service.id}
            service={toAvailabilityService(service)}
            open
            onOpenChange={(open) => {
              if (!open) setAvailabilityOpen(false);
            }}
          />
        )}
      </main>
    </>
  );
}
