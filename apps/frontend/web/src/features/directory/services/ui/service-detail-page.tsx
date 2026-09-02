import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import type { ServiceDetailDTO } from "@ntizo/shared/read-models";
import { SiteHeader } from "@/shared/components/site-header";
import { EmptyCard } from "@/shared/components/empty-card";
import { MapPin, PackageX } from "lucide-react";
import { useServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";
import { ServiceProviderCard } from "@/features/directory/services/ui/service-provider-card";
import { ServicePerformers } from "@/features/directory/services/ui/service-performers";
import { ServiceOptions } from "@/features/directory/services/ui/service-options";
import { RailPriceSummary } from "@/features/directory/services/ui/rail-price-summary";
import { ServiceQuoteNotice } from "@/features/directory/services/ui/service-quote-notice";
import { ServicePackagesUnavailable } from "@/features/directory/services/ui/service-packages-unavailable";
import {
  optionDurationMinutes,
  serviceDetailPanel,
} from "@/features/directory/services/domain/service-card";
// The real ones, from the provider directory. Reused rather than reimplemented
// here: reviews belong to a business, not to one of its services, so there is
// one component and one query for them and this page is a second reader of
// both. See `ServiceReviewsSection` below for what that costs in wording.
import { ProviderReviews } from "@/features/directory/ui/provider-reviews";
import { RatingStars } from "@/features/directory/ui/rating-stars";
import { DetailFacts } from "@/features/directory/ui/detail-facts";
import { DetailGallery } from "@/features/directory/ui/detail-gallery";
import { WeeklyHoursCard } from "@/features/directory/ui/weekly-hours-card";
import { useProviderDetail, useProviderReviews } from "@/features/directory/viewmodel/use-directory";

/**
 * One service, in full.
 *
 * Split in two so `useProviderDetail` below is not called after an early
 * return: the not-found answer needs no provider, and a hook that runs for
 * one service and not for another is the one thing React's rules forbid.
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

  return <ServiceDetail service={service} />;
}

/**
 * The service page proper.
 *
 * Breadcrumb, then the title block full width, then two columns — the photo
 * collage and everything the service *is* on the left, what it costs and how
 * to act on the right. The rail is sticky because it is the part a reader
 * acts on; the left column is the part they read once and scroll past.
 *
 * **The header sits above the grid, and the collage inside it.** This page
 * used to open with a full-width collage and name the service underneath it,
 * matching `ProviderDetailPage` line for line. That symmetry was deliberate —
 * a customer moves between these two pages constantly — but it cost this page
 * the thing it is for: the title landed under 520px of pictures, and the rail
 * under the whole gallery, so the name and the price could not be read in one
 * screen. Naming the thing first and letting the collage share its row with
 * the rail is what every mature booking page does, and the two pages still
 * share every part below the fold. `ProviderDetailPage` is the one now out of
 * step; it should follow, but its header is `ProviderHero`, not this one, so
 * it is a separate move rather than the same patch twice.
 *
 * **The packages moved out of the rail and into the body.** `PackageChooser`
 * held the radio list and the total together in a 22rem column, which is too
 * narrow to compare three packages in and too valuable to spend on a list
 * once one is chosen. `ServiceOptions` takes the rows, `RailPriceSummary`
 * takes the total, and the selection lives here — the only place both can
 * read it from, which is why splitting the component required lifting the
 * state rather than duplicating it.
 *
 * **The provider is read a second time, by slug.** The rail's weekly hours
 * and its verification sentence are facts about the business, and
 * `ServiceDetailDTO` carries neither. That read can resolve to `null` — a
 * provider deactivated between the two queries — so everything drawn from it
 * is guarded: the hours card simply does not render, and the service, which
 * is still real, is still shown in full.
 *
 * Several pieces here render nothing at all in the state most services are
 * actually in — `DetailGallery` with no photographs, `ServiceOptions` with a
 * single package, `ServicePerformers` with fewer than two people,
 * `WeeklyHoursCard` with no configured week, `ProviderReviews` with nobody
 * having reviewed. That is deliberate in each of them and this page must let
 * it: an empty labelled frame reads as a page that failed to load, where the
 * plain absence of a section reads as "not yet".
 */
function ServiceDetail({ service }: { service: ServiceDetailDTO }) {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const provider = useProviderDetail(service.providerSlug, locale);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The provider's own default, falling back to the first option — the
  // cheapest, since `getService` already orders `options` cheapest first.
  // That order is also why nothing here sorts them again: a second sort would
  // be a second place the "cheapest first" rule could drift from the server's.
  //
  // `selected` is re-derived from the current `options` on every render rather
  // than trusted as state. The route reuses this component's instance across
  // services, so a `selectedId` left over from the last service would
  // otherwise point at an option this one does not have; re-deriving also
  // covers the same id disappearing while the page is open, which a remount
  // key would not.
  const defaultOption = service.options.find((option) => option.isDefault) ?? service.options[0];
  const selected = service.options.find((option) => option.id === selectedId) ?? defaultOption;

  // `optionDurationMinutes` gives a fixed package's own length or an hourly
  // one's minimum booking, never both. Read off the *selected* option, like
  // the rail's own breakdown: two "Duration" figures on one screen disagreeing
  // because one of them describes a package nobody chose is exactly what
  // lifting the selection to this component exists to prevent.
  const minutes = selected ? optionDurationMinutes(selected) : null;
  const isHourly = selected?.pricingMode === "hourly";
  const place = [service.providerCity, service.providerDistrict].filter(Boolean).join(", ");
  const providerKind =
    service.providerType === "organization" ? t("typeOrganization") : t("typeIndividual");

  return (
    <>
      <SiteHeader current="services" />

      <main className="page-shell py-8">
        <Breadcrumb service={service} />

        {/*
         * The title block sits above the collage, full width, rather than
         * inside the left column beside it.
         *
         * It used to open with the photographs and name the service under
         * them, which put the one line that confirms "yes, this is the thing
         * I clicked" below a 520px-tall band of pictures — and pushed the
         * rail, the other half of that confirmation, a whole gallery down the
         * page. Lifting the header out of the grid lets the collage and the
         * rail share the first row instead, so the name, the price and the
         * pictures land in one screen rather than two. It is also the order
         * every mature booking site settled on, for the same reason.
         *
         * `min-w-0` survives the move: the title is unbroken provider text
         * and a long unspaced word would otherwise widen the whole shell.
         */}
        <header className="min-w-0">
          {/* The eyebrow names the business first and links to it. On the
              provider page the same line names the trade, because the
              business is the title there; here the business is the thing
              a reader most often wants to leave for, and burying that
              link in the rail's card alone would hide the page's closest
              neighbour. */}
          <p className="type-body text-[var(--color-muted-foreground)]">
            <Link
              to="/providers/$slug"
              params={{ slug: service.providerSlug }}
              className="hover:text-[var(--color-foreground)] hover:underline"
            >
              {service.providerName}
            </Link>
            {` · ${[providerKind, service.categoryName].join(" · ")}`}
          </p>

          <h1 className="type-h1 mt-1.5">{service.name}</h1>

          <p className="type-body mt-3.5 flex flex-wrap items-center gap-x-7 gap-y-2">
            <ServiceHeaderRating service={service} />
            {place && (
              <span className="inline-flex items-center gap-1 text-[var(--color-muted-foreground)]">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {place}
              </span>
            )}
          </p>
        </header>

        {/* `pt-7`, where this used to be `py-10`: the 40px belonged under a
            full-width gallery, and above one that now follows a title it
            reads as a gap in the header rather than the start of the body. */}
        <div className="grid gap-10 pt-7 pb-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="min-w-0">
            {/* No badge over the main photo, though `DetailGallery` offers the
                slot: a verification tick belongs to the business, and this
                page's title is a service. The rail says it in words instead,
                once, and only when it is true. */}
            <DetailGallery key={service.id} images={service.imageUrls} alt={service.name} />

            <DetailFacts
              facts={[
                {
                  label: t("factDuration"),
                  // The empty string is how a row asks `DetailFacts` to drop
                  // the whole pair rather than print a label with nothing
                  // under it. A quote service, and a priced one whose last
                  // option was deactivated, have no length and no pricing
                  // mode to state — and inventing either would be worse than
                  // a shorter row.
                  value:
                    minutes === null
                      ? ""
                      : t(isHourly ? "serviceMinimumMinutes" : "serviceDurationMinutes", {
                          count: minutes,
                        }),
                },
                {
                  label: t("factWhere"),
                  // A location type this build has never heard of resolves to
                  // an empty string rather than a raw, untranslated code — the
                  // same guard `ServiceRow` and `ProviderDetailPage` apply to
                  // the same key.
                  value: t(`filterWhereOption.${service.locationType}`, { defaultValue: "" }),
                },
                {
                  label: t("factPricingMode"),
                  value: selected ? t(isHourly ? "pricingModeHourly" : "pricingModeFixed") : "",
                },
                { label: t("factCategory"), value: service.categoryName },
              ]}
            />

            {service.description && (
              <section className="mt-11">
                <h2 className="type-h2">{t("aboutServiceHeading")}</h2>
                {/* `whitespace-pre-line`, so the paragraph breaks a provider
                    typed into the field survive as paragraph breaks rather
                    than collapsing into one wall of text. */}
                <p className="type-body mt-3.5 max-w-[64ch] whitespace-pre-line">
                  {service.description}
                </p>
              </section>
            )}

            {/* Keyed by id: the route reuses this component's instance across
                services, and while this list is controlled and holds no state
                of its own today, a key costs nothing and is what stops the
                next stateful thing added to it from carrying one service's
                state onto another's page. The
                selection itself is protected by re-derivation above, which a
                key could not do on its own. */}
            <ServiceOptions
              key={service.id}
              options={service.options}
              selectedId={selected?.id ?? ""}
              onSelect={setSelectedId}
              locale={locale}
            />

            <ServicePerformers performers={service.performers} />
            <ServiceReviewsSection service={service} />
          </div>

          {/* 100px, not 0: the site header is 84px and sticky, so a rail
              pinned to the top of the viewport would slide under it. */}
          <aside className="grid gap-4 lg:sticky lg:top-[100px]">
            {(() => {
              // `serviceDetailPanel` (`domain/service-card.ts`) is the one
              // place this three-way split is decided, keyed off
              // `bookingMode` first and never off `options.length` alone —
              // read its doc comment for why a `priced` service can still
              // reach this page with an empty `options` array, and why that
              // is not the same fact as a `quote` service.
              const panel = serviceDetailPanel(service);
              if (panel.kind === "quote") {
                // A quote service has nothing to check a calendar against yet
                // — no price is fixed until the provider has seen the job, so
                // there is no slot to offer a time for, and no priced option
                // for `booking.create` to be handed. `ServiceQuoteNotice`
                // carries the one sentence that explains this
                // (`availabilityQuoteNotice`, the same key checkout's own
                // step 1 falls back to for the identical fact); a "see
                // availability" link into a checkout that could not proceed
                // would be a door onto a wall.
                return <ServiceQuoteNotice providerId={service.providerId} />;
              }
              // A `priced` service with no active packages — see
              // `ServicePackagesUnavailable`'s own doc comment for why this
              // is not `ServiceQuoteNotice` and offers no "see availability"
              // button either: with no active option there is no default
              // duration to check a calendar slot against, and nothing here
              // invents one.
              //
              // `selected` cannot actually be undefined once the panel is
              // `packages` — both read the same `options` array — but it
              // collapses into this branch rather than being asserted away
              // with a `!`, because "no option to price" and "no packages" are
              // the same fact and deserve the same answer.
              if (panel.kind === "unavailable" || !selected) {
                return <ServicePackagesUnavailable />;
              }
              return (
                <RailPriceSummary
                  option={selected}
                  locale={locale}
                  serviceId={service.id}
                  providerId={service.providerId}
                  // False for a provider that failed to resolve, which is the
                  // conservative direction: the sentence claims an
                  // administrator accepted this business's documents, and an
                  // absent answer is not a yes.
                  providerVerified={provider?.verified ?? false}
                />
              );
            })()}

            {/* Renders nothing at all for a provider who never configured
                availability — see its own doc comment for why seven rows of
                "Closed" would be a claim rather than a fact. Mounted only
                when the provider resolved: `useProviderDetail` returns null
                for a business deactivated between this page's two queries. */}
            {provider && <WeeklyHoursCard hours={provider.weeklyHours} />}

            <ServiceProviderCard service={service} />
          </aside>
        </div>
      </main>
    </>
  );
}

/**
 * Where this service sits: home, its category, itself.
 *
 * The category link is a real filter on the browse rather than decoration, so
 * a reader who decided this particular photographer is not for them lands on
 * the others rather than back at everything. It also gives a crawler the one
 * thing a detail page otherwise lacks — a path back up.
 *
 * `aria-label` names the landmark "Breadcrumb", not "Home". It used to read
 * `breadcrumbHome`, which labelled the whole navigation after the first crumb
 * inside it — a screen reader announcing "Home navigation" for the trail that
 * ends at this service. `breadcrumbLabel` exists in all eight locales for
 * exactly this, and `ProviderDetailPage`'s own breadcrumb already uses it.
 *
 * The last crumb is text, not a link to the page you are already on.
 */
function Breadcrumb({ service }: { service: ServiceDetailDTO }) {
  const { t } = useTranslation("directory");

  return (
    <nav aria-label={t("breadcrumbLabel")} className="type-caption mb-4">
      <ol className="flex list-none flex-wrap items-center gap-1.5 p-0 text-[var(--color-muted-foreground)]">
        <li>
          <Link to="/" className="hover:text-[var(--color-foreground)] hover:underline">
            {t("breadcrumbHome")}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link
            to="/services"
            search={{ category: service.categoryCode }}
            className="hover:text-[var(--color-foreground)] hover:underline"
          >
            {service.categoryName}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li className="text-[var(--color-foreground)]">{service.name}</li>
      </ol>
    </nav>
  );
}

/**
 * The score under the title, and a way down to the words behind it.
 *
 * Renders nothing at all until somebody has reviewed. The alternative — an
 * empty set of stars, or "0.0" — is a claim, and the worst one available: a
 * business nobody has rated yet would be shown as the worst on the platform.
 * The same reason `average` arrives null rather than zero all the way from the
 * database.
 *
 * The count is an anchor to the reviews further down, which is the whole
 * reason a marketplace puts the number up here: it is a promise that the
 * evidence exists, and a promise you cannot follow is just a number.
 */
function ServiceHeaderRating({ service }: { service: ServiceDetailDTO }) {
  const data = useProviderReviews(service.providerId);
  if (!data || data.summary.count === 0) return null;

  return (
    <a href="#service-reviews" className="inline-flex hover:underline">
      <RatingStars average={data.summary.average} count={data.summary.count} />
    </a>
  );
}

/**
 * What customers said — about the business, which is not quite what this page
 * is about.
 *
 * Ntizo's reviews are one per person per business, enforced by a unique
 * constraint; there is no such thing as a review of one service. Printing
 * "Reviews (130)" under a service's title would therefore claim something
 * nobody said, so the heading the shared component renders is preceded by a
 * line saying whose verdicts these are. The alternative — showing nothing
 * until per-service reviews exist — throws away the only evidence this page
 * has.
 *
 * The line goes ABOVE that heading, not under the last review. A qualifier
 * printed after the thing it qualifies is read by whoever was already
 * convinced; the reader who scans "Reviews (6)" under a service title and
 * moves on is exactly the one it is for.
 *
 * `ProviderReviews` itself renders nothing when there are none, and this
 * repeats its guard so the sentence never appears alone — a note explaining
 * absent reviews is worse than silence.
 */
function ServiceReviewsSection({ service }: { service: ServiceDetailDTO }) {
  const { t } = useTranslation("directory");
  const data = useProviderReviews(service.providerId);
  if (!data || data.summary.count === 0) return null;

  return (
    <div id="service-reviews" className="scroll-mt-4">
      <p className="type-caption mt-12 text-[var(--color-muted-foreground)]">
        {t("reviewsAboutProvider")}
      </p>
      {/* Its own `mt-12` is cancelled so the note reads as this section's
          subtitle rather than as a stray line above a new section. */}
      <div className="[&>section]:mt-1">
        <ProviderReviews providerId={service.providerId} />
      </div>
    </div>
  );
}
