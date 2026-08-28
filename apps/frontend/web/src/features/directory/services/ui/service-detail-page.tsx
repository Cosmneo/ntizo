import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Button } from "@ntizo/frontend-ui";
import type { ServiceDetailDTO } from "@ntizo/shared/read-models";
import { SiteHeader } from "@/shared/components/site-header";
import { EmptyCard } from "@/shared/components/empty-card";
import { PackageX } from "lucide-react";
import { useServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";
import { ServiceGallery } from "@/features/directory/services/ui/service-gallery";
import { ServiceProviderCard } from "@/features/directory/services/ui/service-provider-card";
import { ServicePerformers } from "@/features/directory/services/ui/service-performers";
import { PackageChooser } from "@/features/directory/services/ui/package-chooser";
import { ServiceQuoteNotice } from "@/features/directory/services/ui/service-quote-notice";
import { ServicePackagesUnavailable } from "@/features/directory/services/ui/service-packages-unavailable";
import { serviceDetailPanel } from "@/features/directory/services/domain/service-card";
// The real ones, from the provider directory. Reused rather than reimplemented
// here: reviews belong to a business, not to one of its services, so there is
// one component and one query for them and this page is a second reader of
// both. See `ServiceReviewsSection` below for what that costs in wording.
import { ProviderReviews } from "@/features/directory/ui/provider-reviews";
import { RatingStars } from "@/features/directory/ui/rating-stars";
import { useProviderReviews } from "@/features/directory/viewmodel/use-directory";
import { AvailabilitySheet } from "@/features/directory/availability/ui/availability-sheet";
import type { ServiceDTO } from "@/features/directory/services/domain/types";

/**
 * Bridges this page's `ServiceDetailDTO` to the `ServiceDTO` shape
 * `AvailabilitySheet` actually reads.
 *
 * The two are the same service described for two different questions.
 * `ServiceDTO` is `services-section.tsx`'s browse-card model: one price to
 * show, already resolved server-side to `defaultOption` /`fromAmountMinor` /
 * `optionCount`. `ServiceDetailDTO` is this page's own, fuller model: the
 * complete, cheapest-first `options` list a chooser can offer, not one
 * card's single price. Nothing priced here is invented — `defaultOption` is
 * derived by the same "marked default, else first" rule `PackageChooser`
 * already applies to the same list, and `fromAmountMinor`/`optionCount` read
 * off the list `AvailabilitySheet` never sees in full. `providerRatingAverage`
 * /`providerReviewCount`/`providerVerified` are the exceptions:
 * `ServiceDetailDTO` carries none of the three, and `AvailabilitySheet`
 * never renders any of them, so there is nothing truthful to derive them
 * from and nothing depending on the result.
 *
 * Kept as a local, unexported function in the one page that needs it rather
 * than moved into `domain/`, since nothing else in this feature converts
 * between these two shapes yet — see the Task 10 report for why that
 * placement is a call worth a reviewer's second look rather than a settled
 * one.
 */
function toAvailabilityService(service: ServiceDetailDTO): ServiceDTO {
  const cheapest = service.options[0] ?? null;
  const defaultOption = service.options.find((o) => o.isDefault) ?? cheapest;
  return {
    id: service.id,
    providerId: service.providerId,
    providerName: service.providerName,
    providerSlug: service.providerSlug,
    providerType: service.providerType,
    // See the exceptions in this function's own doc comment above.
    providerVerified: false,
    providerRatingAverage: null,
    providerReviewCount: 0,
    categoryCode: service.categoryCode,
    categoryName: service.categoryName,
    name: service.name,
    description: service.description,
    locationType: service.locationType,
    bookingMode: service.bookingMode,
    imageUrls: service.imageUrls,
    defaultOption: defaultOption
      ? {
          amountMinor: defaultOption.amountMinor,
          currency: defaultOption.currency,
          durationMinutes: defaultOption.durationMinutes,
          minMinutes: defaultOption.minMinutes,
          stepMinutes: defaultOption.stepMinutes,
          pricingMode: defaultOption.pricingMode,
        }
      : null,
    fromAmountMinor: cheapest?.amountMinor ?? null,
    optionCount: service.options.length,
    isFallback: service.isFallback,
  };
}

/**
 * One service, in full.
 *
 * Two columns on a wide screen: what the service is on the left, what it costs
 * and when it can happen on the right. The right column is what the reader
 * came to act on, so it is the one that stays in view as the left one scrolls.
 */
export function ServiceDetailPage({ id }: { id: string }) {
  const { t, i18n } = useTranslation("directory");
  const service = useServiceDetail(id);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

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
            {/* Keyed by id for the same reason `PackageChooser` and
                `AvailabilitySheet` below are: the route reuses this page's
                component instance across services, so without a key a
                gallery's `active` thumbnail index would survive a navigation
                to a different service and could point past the end of its
                image list, or worse, silently land on the wrong photo of one
                that has enough images not to notice. */}
            <Breadcrumb service={service} />
            <ServiceGallery key={service.id} images={service.imageUrls} alt={service.name} />
            <h1 className="type-h1 mt-6">{service.name}</h1>
            <ServiceHeaderRating service={service} />
            <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
              {[
                [service.providerCity, service.providerDistrict].filter(Boolean).join(", "),
                t(`filterWhereOption.${service.locationType}`),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {service.description && (
              <section className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
                <h2 className="type-h3 font-semibold">{t("detailDescriptionHeading")}</h2>
                <p className="type-body mt-2 whitespace-pre-line">{service.description}</p>
              </section>
            )}
            <ServicePerformers performers={service.performers} />
            <ServiceReviewsSection service={service} />
          </div>
          <div className="grid gap-4 lg:sticky lg:top-4">
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
                // there is no slot to offer a time for. `ServiceQuoteNotice`
                // already carries the one sentence that explains this
                // (`availabilityQuoteNotice`, the same key `AvailabilitySheet`
                // itself falls back to for the identical fact); a "see
                // availability" button that opened the sheet only to repeat
                // that sentence would say the same thing to the reader twice.
                return <ServiceQuoteNotice />;
              }
              if (panel.kind === "unavailable") {
                // A `priced` service with no active packages — see
                // `ServicePackagesUnavailable`'s own doc comment for why this
                // is not `ServiceQuoteNotice` and offers no "see availability"
                // button either: with no active option there is no default
                // duration to check a calendar slot against, and nothing here
                // invents one.
                return <ServicePackagesUnavailable />;
              }
              return (
                <>
                  <PackageChooser key={service.id} options={service.options} locale={locale} />
                  <Button type="button" className="w-full" onClick={() => setAvailabilityOpen(true)}>
                    {t("availabilityCheckAction")}
                  </Button>
                </>
              );
            })()}
            <ServiceProviderCard service={service} />
          </div>
        </div>

        {/* Keyed by id and only ever mounted while open, so every piece of
            the sheet's own local state (the selected week, day, member,
            time…) starts fresh each time — the same reason
            `services-section.tsx` keys its own mount by the selected
            service's id. */}
        {availabilityOpen && (
          <AvailabilitySheet
            key={service.id}
            service={toAvailabilityService(service)}
            performers={service.performers}
            open
            onOpenChange={(open) => {
              if (!open) setAvailabilityOpen(false);
            }}
          />
        )}
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
 * The last crumb is text, not a link to the page you are already on.
 */
function Breadcrumb({ service }: { service: ServiceDetailDTO }) {
  const { t } = useTranslation("directory");

  return (
    <nav aria-label={t("breadcrumbHome")} className="type-caption mb-4">
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
    <a href="#service-reviews" className="mt-2 inline-flex hover:underline">
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
