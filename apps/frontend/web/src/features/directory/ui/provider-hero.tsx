import { useTranslation } from "react-i18next";
import { BadgeCheck, MapPin } from "lucide-react";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { RatingStars } from "@/features/directory/ui/rating-stars";

/**
 * Who this business is, in the space above the fold.
 *
 * Everything here is something the platform actually knows. The reference
 * design this follows also promised "312 jobs completed", the languages the
 * provider speaks, and a map of the area they cover — none of which exists:
 * there are no bookings to count, nothing records what anyone speaks (the
 * services browse's own language filter says so, because it filters the
 * language a *listing* is written in), and the precise location is deliberately
 * kept out of the public read model, so a coverage radius would be a circle
 * drawn around a guess. Inventing any of the three would be the page telling a
 * customer something nobody checked.
 */
export function ProviderHero({ provider }: { provider: ProviderPublicDTO }) {
  const { t } = useTranslation("directory");

  const where = [provider.district, provider.city, provider.country].filter(Boolean).join(", ");
  const kind = provider.type === "organization" ? t("typeOrganization") : t("typeIndividual");

  return (
    <header className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
      <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-muted)]">
        {provider.logoUrl ? (
          <img src={provider.logoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="font-rounded text-xl font-semibold text-[var(--color-muted-foreground)]"
          >
            {initials(provider.name)}
          </span>
        )}
      </span>

      <div className="min-w-0">
        <h1 className="type-h1 flex flex-wrap items-center gap-2">
          {provider.name}
          {provider.verified && (
            <span className="type-caption inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] px-2 py-0.5 font-semibold text-[var(--color-primary)]">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t("providerVerified")}
            </span>
          )}
        </h1>

        <p className="type-body mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--color-muted-foreground)]">
          <span>{kind}</span>
          {provider.categories.length > 0 && (
            <span>· {provider.categories.map((c) => c.name).join(" · ")}</span>
          )}
          {where && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {where}
            </span>
          )}
        </p>

        <p className="mt-2">
          <RatingStars average={provider.ratingAverage} count={provider.reviewCount} />
        </p>

        {provider.description && (
          <p className="type-body mt-4 max-w-[65ch] whitespace-pre-line">{provider.description}</p>
        )}
      </div>
    </header>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? "")
    .join("")
    .toUpperCase();
}
