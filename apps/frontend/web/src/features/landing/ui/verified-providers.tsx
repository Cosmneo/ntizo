import { useTranslation } from "react-i18next";
import { Skeleton } from "@ntizo/frontend-ui";
import { ProviderCard } from "@/shared/components/browse/provider-card";
import { ScrollRail } from "@/shared/components/browse/scroll-rail";
import { usePopularProviders } from "@/features/landing/viewmodel/use-popular-providers";
import { useLocale } from "@/features/landing/viewmodel/use-locale";
import { SectionHead } from "@/features/landing/ui/section-head";

/** How many businesses the home page names. */
export const LANDING_PROVIDERS = 3;

/**
 * The businesses whose documents an administrator checked.
 *
 * The section this splits from used to be called "popular services" and show
 * providers; services have their own section now, so this one can say what it
 * actually means. Both halves of its claim come off the row: a score customers
 * gave, and a verification an administrator performed.
 *
 * Drawn on the shared `ProviderCard` — the same bordered, photo-on-top shape
 * `ServiceCard` fills for the section above, extracted from here so
 * `/providers`' own grid can draw the identical component rather than its
 * old borderless row. The two cards fill the same four slots (an eyebrow, a
 * title, a meta line, a bottom row) with different facts: where a service
 * names its provider in the eyebrow and the service in the title, a provider
 * names its trade and place in the eyebrow and the business itself in the
 * title, with the verification seal riding beside the name instead of beside
 * a provider byline that no longer exists here.
 *
 * Below `sm` the grid becomes `ScrollRail`'s sideways row. `cardWidth="78%"`
 * — wider than `PopularServices`' own 72% — because this card's photo is
 * 16:10 rather than 4:3: the same width would leave it visibly shorter than
 * a service card, and the extra width keeps the two rails in the same
 * rhythm while still leaving a clear peek of the next business.
 */
export function VerifiedProviders() {
  const { t } = useTranslation("landing"); // t:VerifiedProviders
  const locale = useLocale();
  const { data, isLoading } = usePopularProviders(LANDING_PROVIDERS);
  const items = data?.items ?? [];

  if (!isLoading && items.length === 0) return null;

  return (
    <section className="page-shell pt-14">
      <SectionHead
        title={t("home.providersTitle")}
        blurb={t("home.providersBlurb")}
        more={{ label: t("home.providersAll"), to: "/providers" }}
      />
      <ScrollRail
        as="ul"
        columns={2}
        cardWidth="78%"
        className="sm:gap-y-7 lg:grid-cols-3"
      >
        {isLoading
          ? Array.from({ length: LANDING_PROVIDERS }, (_, i) => (
              <li key={i}>
                {/* The same shape as the card it stands in for, down to the
                    class values — see `PopularServices`' own skeleton, which
                    this is copied from so neither loading row reflows when
                    its real card replaces it. */}
                <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
                  <Skeleton className="aspect-[16/10] w-full rounded-none" />
                  <div className="grid gap-2 p-4">
                    <Skeleton className="h-[13px] w-1/3" />
                    <Skeleton className="h-[17px] w-4/5" />
                    <Skeleton className="mt-2 h-[15px] w-2/3" />
                  </div>
                </div>
              </li>
            ))
          : items.map((p) => (
              <li key={p.id}>
                <ProviderCard provider={p} locale={locale} />
              </li>
            ))}
      </ScrollRail>
    </section>
  );
}
