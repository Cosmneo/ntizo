import { useTranslation } from "react-i18next";
import { BadgeCheck, MapPin } from "lucide-react";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { RatingStars } from "@/features/directory/ui/rating-stars";

/**
 * Who this business is: the eyebrow, the name, and the one line of meta a
 * reader weighs it by.
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
 *
 * Three things this used to carry and no longer does, because the page around
 * it grew somewhere better to put them:
 *
 * - The **logo tile** — the page now opens on `DetailGallery`, the business's
 *   own photographs at full width. An 80px avatar under a 520px collage is a
 *   second, smaller picture of the same business competing with the first.
 * - The **description** — moved to the page's own "About" section, under a
 *   heading, where a reader looking for it can find it and a crawler can see
 *   what it is. A paragraph tucked under a rating line is neither.
 * - The **message button** — moved into `ProviderRail`, beside the price. The
 *   two are one decision, and the rail is the part of the page that stays in
 *   view while this block scrolls away.
 *
 * The verification badge stays here rather than moving with the button. It is
 * a fact about the *name* it sits beside, and the gallery that repeats it over
 * the main photograph renders nothing at all for a provider with no photos —
 * which is most of them.
 */
export function ProviderHero({ provider }: { provider: ProviderPublicDTO }) {
  const { t } = useTranslation("directory");

  const where = [provider.district, provider.city, provider.country].filter(Boolean).join(", ");
  const kind = provider.type === "organization" ? t("typeOrganization") : t("typeIndividual");

  return (
    <header className="min-w-0">
      <p className="type-body text-[var(--color-muted-foreground)]">
        {[kind, ...provider.categories.map((c) => c.name)].join(" · ")}
      </p>

      <h1 className="type-h1 mt-1.5 flex flex-wrap items-center gap-2">
        {provider.name}
        {provider.verified && (
          <span className="type-caption inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] px-2 py-0.5 font-semibold text-[var(--color-primary)]">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {t("providerVerified")}
          </span>
        )}
      </h1>

      <p className="type-body mt-3.5 flex flex-wrap items-center gap-x-7 gap-y-2">
        <RatingStars average={provider.ratingAverage} count={provider.reviewCount} />
        {where && (
          <span className="inline-flex items-center gap-1 text-[var(--color-muted-foreground)]">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {where}
          </span>
        )}
      </p>
    </header>
  );
}
