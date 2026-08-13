import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback } from "@ntizo/frontend-ui";
import { initialsFrom } from "@/shared/lib/initials";
import type { ServiceDetailDTO } from "@ntizo/shared/read-models";

/**
 * The business behind this service, on the service's own page.
 *
 * Not a repeat of `ProviderDetailPage`'s own header — this card only has to
 * say *who*, well enough that a reader recognises the business and can reach
 * its full page. The description, the rest of the catalogue, everything else
 * already lives at `/providers/$slug`.
 *
 * Logo falls back to a monogram exactly as the admin's own provider header
 * does: the `<img>` sits beside `AvatarFallback` rather than replacing it, so
 * a provider with no logo still shows something.
 *
 * No verification tick. The mockup this page came from puts a green check
 * beside the name, but `ServiceDetailDTO` carries no verification field, and
 * there is no field to add in passing here — see the design spec's own
 * section on why faking one is worse than an invented rating: an invented
 * rating is an invented opinion, an invented tick is the platform vouching
 * for a business it has not checked.
 */
export function ServiceProviderCard({ service }: { service: ServiceDetailDTO }) {
  const { t } = useTranslation("directory");
  const place = [service.providerCity, service.providerDistrict]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12 shrink-0">
          {service.providerLogoUrl && (
            <img
              src={service.providerLogoUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
          <AvatarFallback>{initialsFrom(service.providerName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="type-body-medium truncate font-semibold">
            {service.providerName}
          </p>
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {t(
              service.providerType === "organization"
                ? "typeOrganization"
                : "typeIndividual",
            )}
            {place ? ` · ${place}` : ""}
          </p>
        </div>
      </div>
      <Link
        to="/providers/$slug"
        params={{ slug: service.providerSlug }}
        className="mt-4 inline-block text-sm text-[var(--color-accent)] hover:underline"
      >
        {t("viewProviderProfile")}
      </Link>
    </div>
  );
}
