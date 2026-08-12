import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useProviderDetail } from "@/features/directory/viewmodel/use-directory";
import { ProviderServicesSection } from "@/features/directory/services/ui/services-section";

/**
 * A single provider's public page.
 *
 * Server-rendered, so this is the HTML a search engine indexes for that
 * provider. The `<title>` and description are set in the route's `head`, from
 * the same loader data — a page whose title is the site name for every
 * provider is worth very little in a result list.
 */
export function ProviderDetailPage({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation("directory");
  const provider = useProviderDetail(slug);
  const locale = i18n.resolvedLanguage ?? i18n.language;

  if (!provider) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
        <p className="mt-3 text-[var(--color-muted-foreground)]">
          {t("notFoundBody")}
        </p>
        <Link
          to="/providers"
          className="mt-8 inline-block text-[var(--color-accent)] hover:underline"
        >
          {t("backToDirectory")}
        </Link>
      </main>
    );
  }

  const place = [provider.city, provider.district, provider.country]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link
        to="/providers"
        className="text-sm text-[var(--color-accent)] hover:underline"
      >
        {t("backToDirectory")}
      </Link>

      <h1 className="mt-6 text-3xl font-semibold">{provider.name}</h1>
      <p className="mt-2 text-[var(--color-muted-foreground)]">
        {t(
          provider.type === "organization"
            ? "typeOrganization"
            : "typeIndividual",
        )}
        {place ? ` · ${place}` : ""}
      </p>

      {provider.description ? (
        <p className="mt-8 whitespace-pre-line">{provider.description}</p>
      ) : (
        <p className="mt-8 text-[var(--color-muted-foreground)]">
          {t("noDescription")}
        </p>
      )}

      <ProviderServicesSection
        providerId={provider.id}
        providerImageUrl={provider.logoUrl}
        locale={locale}
      />
    </main>
  );
}
