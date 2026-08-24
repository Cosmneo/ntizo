import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { useProviderDetail } from "@/features/directory/viewmodel/use-directory";
import { ProviderServicesSection } from "@/features/directory/services/ui/services-section";
import { ProviderHero } from "@/features/directory/ui/provider-hero";
import { ProviderPortfolio } from "@/features/directory/ui/provider-portfolio";
import { ProviderReviews } from "@/features/directory/ui/provider-reviews";
import { SiteHeader } from "@/shared/components/site-header";

/**
 * A single provider's public page.
 *
 * Server-rendered, so this is the HTML a search engine indexes for that
 * provider. The `<title>` and description are set in the route's `head`, from
 * the same loader data — a page whose title is the site name for every provider
 * is worth very little in a result list.
 *
 * Read top to bottom the way somebody decides: who they are and whether anyone
 * vouches for them, what their work looks like, what they sell, then what
 * customers actually said. The reviews come last and load separately, because
 * they are the part a reader scrolls to rather than the part they arrive for.
 *
 * The page carried no header before this — a reader who landed on it from a
 * search result had no navigation at all.
 */
export function ProviderDetailPage({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const provider = useProviderDetail(slug, locale);

  if (!provider) {
    return (
      <>
        <SiteHeader current="providers" />
        <main className="page-shell py-16 text-center">
          <h1 className="type-h1">{t("notFoundTitle")}</h1>
          <p className="type-body mt-3 text-[var(--color-muted-foreground)]">{t("notFoundBody")}</p>
          <Link
            to="/providers"
            className="type-body-medium mt-8 inline-block font-semibold text-[var(--color-primary)] hover:underline"
          >
            {t("backToDirectory")}
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader current="providers" />

      <main className="page-shell py-8">
        <Link
          to="/providers"
          className="type-caption inline-flex items-center gap-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {t("backToDirectory")}
        </Link>

        <div className="mt-5">
          <ProviderHero provider={provider} />
        </div>

        <ProviderPortfolio photoUrls={provider.photoUrls} providerName={provider.name} />

        <ProviderServicesSection
          providerId={provider.id}
          providerImageUrl={provider.logoUrl}
          locale={locale}
        />

        <ProviderReviews providerId={provider.id} />
      </main>
    </>
  );
}
