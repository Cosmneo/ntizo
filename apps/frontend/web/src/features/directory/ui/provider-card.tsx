import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BadgeCheck, ChevronRight, MapPin } from "lucide-react";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { RatingStars } from "@/features/directory/ui/rating-stars";

/**
 * One business, as somebody scanning the directory meets it.
 *
 * The card this replaces printed a name and the word "Individual", which is not
 * enough to choose between two plumbers — and it was not a link at all, so the
 * only way to reach a provider from the directory was to already know the URL.
 *
 * **One link, covering the whole card.** The `::after` spans the card so the
 * entire surface is the target, while the tab order gets a single stop with the
 * business's name as its accessible name. A card built from six links — logo,
 * name, each category, the CTA — is six stops for one destination, which is
 * what a keyboard reader experiences as noise.
 *
 * The initials fallback is not decoration: most providers have no logo yet, and
 * a grid of identical grey placeholders is harder to scan than a grid of
 * different two-letter marks.
 */
export function ProviderCard({ provider }: { provider: ProviderPublicDTO }) {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const where = [provider.district, provider.city].filter(Boolean).join(", ");
  const kind = provider.type === "organization" ? t("typeOrganization") : t("typeIndividual");

  return (
    // White on the page's tinted ground, so a card is an object rather than a
    // rectangle drawn in outline — the grid read as a wireframe when both were
    // the same white. The lift on hover is what says it is one thing to click,
    // now that the whole card is the target.
    <li className="group relative flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-4 shadow-[0_1px_2px_rgba(19,23,27,0.05)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--color-primary)_34%,var(--color-border))] hover:shadow-[0_1px_3px_rgba(19,23,27,0.06),0_10px_26px_-14px_rgba(19,23,27,0.18)] focus-within:border-[var(--color-primary)]">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-muted)]">
          {provider.logoUrl ? (
            <img
              src={provider.logoUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="font-rounded text-sm font-semibold text-[var(--color-muted-foreground)]"
            >
              {initials(provider.name)}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5">
            <Link
              to="/providers/$slug"
              params={{ slug: provider.slug }}
              className="type-h3 truncate font-semibold after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none"
            >
              {provider.name}
            </Link>
            {provider.verified && (
              <BadgeCheck
                className="h-4 w-4 shrink-0 text-[var(--color-primary)]"
                aria-label={t("providerVerified")}
              />
            )}
          </h2>

          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="type-caption rounded-full border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-0.5 text-[var(--color-muted-foreground)]">
              {kind}
            </span>
            {where && (
              <span className="type-caption inline-flex min-w-0 items-center gap-1 text-[var(--color-muted-foreground)]">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{where}</span>
              </span>
            )}
            <RatingStars average={provider.ratingAverage} count={provider.reviewCount} />
          </p>
        </div>
      </div>

      {provider.description && (
        <p className="type-caption line-clamp-2 text-[var(--color-foreground)]">
          {provider.description}
        </p>
      )}

      {(provider.categories.length > 0 || provider.serviceCount > 0) && (
        <p className="flex flex-wrap gap-1.5">
          {/* Capped at three. A business publishing in eight trades would push
              the price and the link off the bottom of every card in its row. */}
          {provider.categories.slice(0, 3).map((c) => (
            <Tag key={c.code}>{c.name}</Tag>
          ))}
          {provider.serviceCount > 0 && (
            <Tag>{t("providerServiceCount", { count: provider.serviceCount })}</Tag>
          )}
        </p>
      )}

      {/* No `mt-auto`. Anchoring the footer to the bottom of a stretched card
          opened a hole of empty white inside every card shorter than the
          tallest in its row — and with most businesses carrying no description
          yet, that was most of them. The grid no longer stretches them either
          (see `items-start` on the page), so a card is as tall as what it has
          to say and the space between cards is between them. */}
      <p className="flex items-end gap-3 border-t border-[var(--color-border)] pt-3">
        {provider.fromAmountMinor !== null && provider.fromCurrency && (
          <span className="grid">
            <span className="type-caption text-[var(--color-muted-foreground)]">
              {t("providerFrom")}
            </span>
            <b className="font-rounded text-[0.95rem] font-semibold tabular-nums">
              {formatPrice(provider.fromAmountMinor, provider.fromCurrency, locale)}
            </b>
          </span>
        )}
        <span className="type-caption ml-auto inline-flex items-center gap-1 font-semibold text-[var(--color-primary)]">
          {t("providerOpen")}
          <ChevronRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </p>
    </li>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="type-caption rounded-[7px] border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-0.5 text-[var(--color-muted-foreground)]">
      {children}
    </span>
  );
}

/**
 * Up to two initials from a business name.
 *
 * `Intl.Segmenter` rather than `name[0]`: a name beginning with an emoji, an
 * accented letter formed from two code points, or a script outside the BMP
 * would otherwise be cut mid-character and render as a replacement box.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) return "?";
  return words
    .map((word) => {
      if (typeof Intl.Segmenter === "function") {
        const [first] = new Intl.Segmenter().segment(word);
        return first?.segment ?? "";
      }
      return [...word][0] ?? "";
    })
    .join("")
    .toUpperCase();
}

/**
 * Minor units as money, in the reader's language.
 *
 * Whole units only: a directory card is a "from" price, and two decimals of
 * precision on a number that is already an approximation is noise. `Intl` knows
 * every currency's symbol and where it goes, so none of that is spelled out.
 */
function formatPrice(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}
