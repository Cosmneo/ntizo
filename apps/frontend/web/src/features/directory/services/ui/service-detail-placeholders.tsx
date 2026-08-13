/**
 * ⚠️ EVERYTHING IN THIS FILE IS INVENTED.
 *
 * There is no Review context, no Booking context, no service radius and no
 * cancellation policy in Ntizo. These sections exist so the page can be seen
 * whole before those are built, and they were deliberately shipped without a
 * flag separating them from the real sections around them (decision,
 * 2026-08-13).
 *
 * That means: on a page that also names a real business, a real price and a
 * real address, "4.3 · 130 avaliações" is a claim about that business that
 * nobody made.
 *
 * Delete this file and its three call sites before the first real provider is
 * onboarded. `docs/superpowers/follow-ups.md` entry 43 carries the trigger.
 *
 * Duration used to be a fourth invented fact in `ServiceFacts` below
 * ("4–12 horas" beside a 60-minute haircut's real price) and no longer is: it
 * is real data (`domain/service-card.ts`'s `optionDurationMinutes`), rendered
 * by `PackageChooser` next to whichever package the customer has selected.
 * `ServiceFacts` keeps only the two facts that genuinely have no data behind
 * them — service area and cancellation policy.
 */

import { useTranslation } from "react-i18next";
import { MapPin, ShieldCheck, Star } from "lucide-react";
import { Avatar, AvatarFallback, cn } from "@ntizo/frontend-ui";
import { initialsFrom } from "@/shared/lib/initials";

// ---------------------------------------------------------------------------
// Invented data.
//
// Everything below is a constant, not a prop, not a query result — nothing
// in this file reads `ServiceDetailDTO` or any hook that talks to a server.
// That is deliberate: a reviewer checking whether real data leaks into these
// three components only has to check that this module imports no data source
// at all.
//
// The line between what lives here and what lives in `directory.json`: labels
// and sentence scaffolding ("Reviews", "Service area", "{{count}} out of 5
// stars") are UI chrome and are genuinely translated in all eight locales,
// same as every other string in this feature. The content a fabricated
// person supposedly wrote — names, review bodies, the provider's reply — is
// not; inventing a Mozambican customer's testimonial in eight languages would
// spread fabricated prose across eight files for a future cleanup to hunt
// down, which is the exact failure mode the brief for this file warns
// against. Dates follow the same reasoning as amounts elsewhere in this
// feature: the calendar day is data (a constant), how it reads in a given
// locale is formatting (`Intl.DateTimeFormat`, pinned to UTC exactly as
// `date-strip.tsx`'s `formatDate` does, for the same reason).
// ---------------------------------------------------------------------------

const RATING_VALUE = 4.3;
const RATING_COUNT = 130;

interface InventedReview {
  id: string;
  author: string;
  /** Out of 5. */
  rating: number;
  /** Civil date, `YYYY-MM-DD` — see `formatReviewDate`. */
  dateIso: string;
  body: string;
  /** The provider's reply, or null when this review has none. */
  reply: string | null;
}

const REVIEWS: readonly InventedReview[] = [
  {
    id: "r-1",
    author: "Carla Machava",
    rating: 5,
    dateIso: "2026-06-30",
    body: "Serviço impecável, chegaram a horas e trataram de tudo com muito cuidado. Recomendo!",
    reply: "Obrigado, Carla! Foi um prazer atender-vos.",
  },
  {
    id: "r-2",
    author: "Miguel Langa",
    rating: 4,
    dateIso: "2026-06-12",
    body: "Bom trabalho, só demorou um pouco mais do que o combinado inicialmente.",
    reply: null,
  },
];

const FACTS = {
  areaCity: "Maputo",
  areaRadiusKm: 15,
  cancellationHours: 24,
};

/**
 * A civil date (`YYYY-MM-DD`) formatted with `Intl`, pinned to UTC so the
 * reader's own device timezone can never shift which calendar day a bare
 * date string reads as — the same trick `date-strip.tsx`'s `formatDate` and
 * `provider/availability/domain/week.ts` use for the identical reason.
 */
function formatReviewDate(dateIso: string, locale: string): string {
  const [y, m, d] = dateIso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Five stars, filled up to `rating`. Purely decorative — the number beside it (or the aria-label on its wrapper) carries the meaning. */
function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex items-center gap-0.5", className)}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i < Math.round(rating)
              ? "fill-[#f5a524] text-[#f5a524]"
              : "fill-none text-[var(--color-border)]",
          )}
        />
      ))}
    </span>
  );
}

/** The star rating and review count, under the service title. */
export function ServiceRating() {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const rf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <div
      role="img"
      aria-label={t("ratingAriaLabel", { rating: rf.format(RATING_VALUE), count: RATING_COUNT })}
      className="mt-2 flex items-center gap-1.5 text-sm"
    >
      <Star className="h-4 w-4 fill-[#f5a524] text-[#f5a524]" aria-hidden="true" />
      <span className="font-semibold tabular-nums" aria-hidden="true">
        {rf.format(RATING_VALUE)}
      </span>
      <span className="text-[var(--color-muted-foreground)]" aria-hidden="true">
        · {t("ratingCount", { count: RATING_COUNT })}
      </span>
    </div>
  );
}

/** The reviews section: two invented reviews, one with the provider's reply. */
export function ServiceReviews() {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div className="mt-8">
      <h2 className="type-h3 font-semibold">{t("reviewsTitle")}</h2>
      <ul className="mt-3 grid list-none gap-5 p-0">
        {REVIEWS.map((review) => (
          <li key={review.id}>
            <div className="flex items-start gap-3">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback>{initialsFrom(review.author)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="type-body-medium font-semibold">{review.author}</span>
                  <span role="img" aria-label={t("reviewsStarsLabel", { count: review.rating })}>
                    <Stars rating={review.rating} />
                  </span>
                  <span className="type-caption text-[var(--color-muted-foreground)]">
                    {formatReviewDate(review.dateIso, locale)}
                  </span>
                </div>
                <p className="type-body mt-1">{review.body}</p>
                {review.reply && (
                  <div className="mt-2 rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] p-3">
                    <p className="type-caption font-semibold text-[var(--color-muted-foreground)]">
                      {t("reviewsReplyLabel")}
                    </p>
                    <p className="type-body mt-0.5">{review.reply}</p>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Service area and cancellation policy — a footer row under the description. */
export function ServiceFacts() {
  const { t } = useTranslation("directory");

  const facts = [
    {
      icon: MapPin,
      label: t("factsAreaLabel"),
      value: t("factsAreaValue", { city: FACTS.areaCity, radius: FACTS.areaRadiusKm }),
    },
    {
      icon: ShieldCheck,
      label: t("factsCancellationLabel"),
      value: t("factsCancellationValue", { hours: FACTS.cancellationHours }),
    },
  ];

  return (
    <dl className="mt-6 grid gap-3 border-t border-[var(--color-border)] pt-4 sm:grid-cols-2">
      {facts.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-start gap-2">
          <Icon
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <dt className="type-caption text-[var(--color-muted-foreground)]">{label}</dt>
            <dd className="type-body-medium">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
