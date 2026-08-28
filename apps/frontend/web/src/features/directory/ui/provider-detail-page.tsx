import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BadgeCheck } from "lucide-react";
import type { ProviderPublicDetailDTO } from "@ntizo/shared/read-models";
import { useProviderDetail } from "@/features/directory/viewmodel/use-directory";
import { formatMemberSince } from "@/features/directory/domain/member-since";
import { ProviderServicesSection } from "@/features/directory/services/ui/services-section";
import { DetailFacts } from "@/features/directory/ui/detail-facts";
import { DetailGallery } from "@/features/directory/ui/detail-gallery";
import { ProviderHero } from "@/features/directory/ui/provider-hero";
import { ProviderRail } from "@/features/directory/ui/provider-rail";
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
 * Two columns, and the split is the point: who they are and what they sell on
 * the left, what it costs and how to reach them on the right. The page it
 * replaces had no rail and no price anywhere on it — a reader could get all
 * the way down the services list without learning whether this was a 500 or a
 * 5000 job. The rail is sticky because it is the part a reader acts on, and
 * the left column is the part they read first and scroll past.
 *
 * Below `lg` the rail unstacks under the content, so the phone reads
 * top-to-bottom the way somebody decides: photographs, who they are, the four
 * facts, what they say about themselves, what they sell, what customers said.
 *
 * Three of the pieces here render nothing at all in the state most providers
 * are actually in — `DetailGallery` with no photographs, `WeeklyHoursCard`
 * (inside the rail) with no configured week, `ProviderReviews` with nobody
 * having reviewed. That is deliberate in each of them and the page must let
 * it: an empty labelled frame reads as a page that failed to load, where the
 * plain absence of a section reads as "not yet".
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
        <Breadcrumb provider={provider} />

        <DetailGallery
          images={provider.photoUrls}
          alt={provider.name}
          badge={provider.verified ? <VerifiedBadge /> : undefined}
        />

        <div className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="min-w-0">
            <ProviderHero provider={provider} />

            <DetailFacts
              facts={[
                {
                  label: t("factCategory"),
                  value: provider.categories.map((category) => category.name).join(" · "),
                },
                { label: t("factWhere"), value: locationLabels(provider.serviceLocationTypes, t) },
                // `String(0)` survives `DetailFacts`'s empty-value filter, and
                // should: a provider with nothing published has published
                // nothing, which is a fact worth stating beside a category and
                // a join month. It is an empty *string* that means "we failed
                // to read this", and only that gets dropped.
                { label: t("servicesTitle"), value: String(provider.serviceCount) },
                {
                  label: t("factMemberSince"),
                  // `formatMemberSince` returns null for a missing or
                  // malformed value; the empty string is how this row asks
                  // `DetailFacts` to drop the whole pair rather than print a
                  // label with nothing under it.
                  value: formatMemberSince(provider.memberSince, locale) ?? "",
                },
              ]}
            />

            {provider.description && (
              <section className="mt-11">
                <h2 className="type-h2">{t("aboutHeading")}</h2>
                {/* `whitespace-pre-line`, so the paragraph breaks a provider
                    typed into the field survive as paragraph breaks rather
                    than collapsing into one wall of text. */}
                <p className="type-body mt-3.5 max-w-[64ch] whitespace-pre-line">
                  {provider.description}
                </p>
              </section>
            )}

            <ProviderServicesSection
              providerId={provider.id}
              providerImageUrl={provider.logoUrl}
              locale={locale}
            />

            <ProviderReviews providerId={provider.id} />
          </div>

          {/* 100px, not 0: the site header is 84px and sticky, so a rail
              pinned to the top of the viewport would slide under it. */}
          <aside className="lg:sticky lg:top-[100px]">
            <ProviderRail provider={provider} />
          </aside>
        </div>
      </main>
    </>
  );
}

/**
 * Every place this business actually works, joined — "At your place · At
 * their place".
 *
 * All of them, never collapsed. An earlier draft folded three or more into
 * `filterWhereOption.flexible`, which is wrong: `flexible` is one of the four
 * location types a service can be published under, not a word meaning
 * "several", so a provider who both travels and receives would have been
 * relabelled as one who does neither in particular.
 *
 * A code this build has never heard of resolves to an empty string rather
 * than a raw, untranslated identifier — falsy, so it drops out of the join
 * instead of leaving a stray separator beside nothing. The same guard
 * `ServiceRow` applies to the same key.
 */
function locationLabels(
  codes: readonly string[],
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return codes
    .map((code) => t(`filterWhereOption.${code}`, { defaultValue: "" }))
    .filter(Boolean)
    .join(" · ");
}

/**
 * "Verified", over the main photograph.
 *
 * White ground and a shadow rather than the hero badge's tinted pill: this one
 * sits on top of an image whose colours nobody controls, where a 10%-primary
 * wash would be unreadable against half the photographs providers upload.
 *
 * Rendered only when `provider.verified` — the flag means an administrator
 * accepted at least one document, which is the whole of what the word claims.
 */
function VerifiedBadge() {
  const { t } = useTranslation("directory");

  return (
    <span className="type-caption inline-flex items-center gap-1.5 rounded-full bg-[var(--color-background)] px-3 py-1.5 font-semibold text-[var(--color-success)] shadow-[var(--shadow-sm)]">
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
      {t("providerVerified")}
    </span>
  );
}

/**
 * Where this business sits: the directory, its trade, itself.
 *
 * The middle crumb is a real filter on the directory rather than decoration,
 * so a reader who decided this particular electrician is not for them lands on
 * the others rather than back at everything. It also gives a crawler the one
 * thing a detail page otherwise lacks — a path back up. The same shape
 * `ServiceDetailPage`'s own breadcrumb already uses.
 *
 * A provider publishes no services in any category until they publish a
 * service at all, so `categories` can be empty — in which case the middle
 * crumb is omitted rather than rendered as a link to an empty filter.
 *
 * The last crumb is text, not a link to the page you are already on.
 */
function Breadcrumb({ provider }: { provider: ProviderPublicDetailDTO }) {
  const { t } = useTranslation("directory");
  const category = provider.categories[0];

  return (
    <nav aria-label={t("breadcrumbLabel")} className="type-caption mb-4">
      <ol className="flex list-none flex-wrap items-center gap-1.5 p-0 text-[var(--color-muted-foreground)]">
        <li>
          <Link to="/providers" className="hover:text-[var(--color-foreground)] hover:underline">
            {t("breadcrumbProviders")}
          </Link>
        </li>
        {category && (
          <>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                to="/providers"
                search={{ category: category.code }}
                className="hover:text-[var(--color-foreground)] hover:underline"
              >
                {category.name}
              </Link>
            </li>
          </>
        )}
        <li aria-hidden="true">/</li>
        <li className="text-[var(--color-foreground)]">{provider.name}</li>
      </ol>
    </nav>
  );
}
