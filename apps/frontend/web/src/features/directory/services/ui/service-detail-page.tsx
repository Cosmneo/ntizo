import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/shared/components/site-header";
import { EmptyCard } from "@/shared/components/empty-card";
import { PackageX } from "lucide-react";
import { useServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";
import { ServiceGallery } from "@/features/directory/services/ui/service-gallery";
import { ServiceProviderCard } from "@/features/directory/services/ui/service-provider-card";
import { ServicePerformers } from "@/features/directory/services/ui/service-performers";

/**
 * One service, in full.
 *
 * Two columns on a wide screen: what the service is on the left, what it costs
 * and when it can happen on the right. The right column is what the reader
 * came to act on, so it is the one that stays in view as the left one scrolls.
 */
export function ServiceDetailPage({ id }: { id: string }) {
  const { t } = useTranslation("directory");
  const service = useServiceDetail(id);

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
          <div className="lg:sticky lg:top-4">
            <ServiceProviderCard service={service} />
          </div>
        </div>
      </main>
    </>
  );
}
