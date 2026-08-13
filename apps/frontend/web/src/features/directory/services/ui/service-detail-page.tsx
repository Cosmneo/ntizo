import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/shared/components/site-header";
import { EmptyCard } from "@/shared/components/empty-card";
import { PackageX } from "lucide-react";
import { useServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";

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
            <h1 className="type-h1">{service.name}</h1>
            <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
              {[service.categoryName, service.providerCity].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="lg:sticky lg:top-4" />
        </div>
      </main>
    </>
  );
}
