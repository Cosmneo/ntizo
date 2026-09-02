import { useTranslation } from "react-i18next";
import { Check, ImageIcon } from "lucide-react";
import { formatAmount } from "@/features/directory/services/domain/service-card";
import type { CompactSlot } from "@/features/checkout/domain/slot-wording";

/**
 * Whether the *provider* travels to the job, which is the only reading under
 * which "Deslocação — Incluída" is a true sentence.
 *
 * A barber's shop (`at_provider`) and a remote consultation involve no
 * journey the platform could include or charge for, and telling a customer
 * their travel is included when they are the one travelling is worse than
 * saying nothing. `locationType` is a bare `string` on the read model rather
 * than an enum, so an unrecognised value answers "no" and the line is simply
 * absent — the safe direction for a claim about money.
 */
function providerTravels(locationType: string | null): boolean {
  return locationType === "at_customer" || locationType === "flexible";
}

/**
 * The card that runs down the right of every checkout page: what is being
 * booked, when, what it costs, and the two promises the platform actually
 * keeps.
 *
 * One component rather than a copy per step, because the three pages
 * previously carried three near-identical rails and the price line is the one
 * thing on this flow that must not be allowed to drift between them.
 *
 * **There is no commission line and no fee line, on purpose.** The commission
 * comes out of the provider's payout, so the customer pays the price the
 * provider set and is never shown a split; a "Taxa Ntizo" row here would
 * invent a charge nobody is being asked for. The checkout query does not even
 * fetch the commission — see `CheckoutBooking` and `BOOKING_FIELDS` for the
 * two levels that keep it off the wire as well as off the screen.
 *
 * Likewise absent: a cancellation window, which nothing in this product
 * models, and a materials note, which the catalogue has no concept of.
 */
export function CheckoutRail({
  imageUrl,
  serviceName,
  providerName,
  optionName,
  slot,
  locationType,
  durationMinutes,
  priceMinor,
  currency,
  hourly = false,
  onChangeSlot,
  countdown,
  children,
}: {
  /** The service's own picture, or null when it has none. */
  imageUrl: string | null;
  serviceName: string;
  providerName: string;
  /** Which package is being booked — printed so a fallback substitution is never silent. */
  optionName: string | null;
  /**
   * The appointment, already worded **in the service's timezone**, or null
   * while the customer is still choosing one.
   *
   * Worded by the caller rather than formatted here, because a component
   * handed two instants is a component that will eventually format them in
   * whichever zone it is running in — the substitution that drew step 1 an
   * empty grid under a live confirm button.
   */
  slot: CompactSlot | null;
  /** The service's location type, or null when the caller cannot know it. */
  locationType: string | null;
  durationMinutes: number | null;
  /**
   * What the customer pays, or **null when there is no price to state**.
   *
   * Null is a real case rather than defensive typing: a quote service has no
   * priced option at all, and a `priced` one whose provider deactivated its
   * last package looks identical on the wire. Both reach this page, both draw
   * a notice instead of a calendar, and neither has an amount — so the whole
   * price block is left out rather than printed as a zero.
   */
  priceMinor: number | null;
  currency: string;
  /**
   * An hourly package, whose total is not knowable until a length is chosen.
   *
   * The breakdown collapses to the hourly rate rather than printing a "Total"
   * that is really the price of one hour — a number a customer would read as
   * the whole job.
   */
  hourly?: boolean;
  /** Back to step 1. Absent on step 1 itself, which is already where the choosing happens. */
  onChangeSlot?: () => void;
  /** The hold countdown, on the steps that have a draft to count down. */
  countdown?: React.ReactNode;
  /** The step's own action area — its button, and whatever it has to say about it. */
  children?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation("checkout");
  const { t: td } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const where = locationType
    ? td(`filterWhereOption.${locationType}`, { defaultValue: "" })
    : "";
  const length =
    durationMinutes === null
      ? ""
      : td(hourly ? "serviceMinimumMinutes" : "serviceDurationMinutes", {
          count: durationMinutes,
        });
  // Guarded rather than defaulted to zero: `Intl.NumberFormat` throws on a
  // blank currency code, and a quote service genuinely has neither.
  const price = priceMinor === null ? null : formatAmount(priceMinor, currency, locale);

  return (
    <div className="grid gap-5 rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
      {countdown}

      <div className="flex items-start gap-3">
        {imageUrl ? (
          // `alt=""`: the service is named in the heading right beside it, and
          // a screen reader repeating that name for the picture is noise.
          <img
            src={imageUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-[var(--radius-card-sm)] object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
          >
            <ImageIcon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="type-body-medium font-semibold">{serviceName}</h2>
          {/* The provider's name alone. The mockup adds their rating and a
              "Verificado" badge beside it; neither reaches this page —
              `serviceDetailReadModel` publishes no rating and no verified flag
              (only the browse card's `serviceReadModel` does) and
              `bookingReadModel` publishes neither either. Inventing them here
              would be worse than leaving them out. */}
          <p className="type-caption text-[var(--color-muted-foreground)]">{providerName}</p>
        </div>
      </div>

      <div className="rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] p-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="type-caption font-semibold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
            {t("railWhenLabel")}
          </p>
          {onChangeSlot && (
            <button
              type="button"
              onClick={onChangeSlot}
              className="type-caption font-semibold text-[var(--color-primary)] hover:underline"
            >
              {t("railChangeAction")}
            </button>
          )}
        </div>
        {slot ? (
          <>
            <p className="type-body-medium mt-1 font-semibold tabular-nums">
              {t("railWhen", { date: slot.date, start: slot.start, end: slot.end })}
            </p>
            {(where || length) && (
              <p className="type-caption text-[var(--color-muted-foreground)]">
                {[where, length].filter(Boolean).join(" · ")}
              </p>
            )}
          </>
        ) : (
          // Said, not left blank. The customer is in the middle of choosing,
          // and an empty panel where a time is about to go reads as a page
          // that failed to load rather than as one waiting for them.
          <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">
            {t("railWhenPending")}
          </p>
        )}
      </div>

      {price !== null && (
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="type-body">{t("railPriceService")}</p>
              {optionName && (
                <p className="type-caption text-[var(--color-muted-foreground)]">
                  {[optionName, length].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <p className="type-body tabular-nums">
              {price}
              {hourly && (
                <span className="text-[var(--color-muted-foreground)]">
                  {td("priceHourlySuffix")}
                </span>
              )}
            </p>
          </div>

          {/* Only where somebody actually travels — see `providerTravels`. */}
          {providerTravels(locationType) && (
            <div className="flex items-baseline justify-between gap-3">
              <p className="type-body">{t("railPriceTravel")}</p>
              <p className="type-body text-[var(--color-muted-foreground)]">
                {t("railPriceTravelIncluded")}
              </p>
            </div>
          )}

          {/* No total on an hourly package: the length is still the customer's
              to choose, so any figure here would be the price of the minimum
              wearing the whole job's name. */}
          {!hourly && (
            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-[var(--color-border)] pt-3">
              <p className="type-body-medium font-semibold">{t("railPriceTotal")}</p>
              <p className="type-h3 font-semibold tabular-nums">{price}</p>
            </div>
          )}
        </div>
      )}

      {children}

      <ul className="type-caption grid gap-2 text-[var(--color-muted-foreground)]">
        {[t("railTrustPayment"), t("railTrustVerified")].map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Check
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-success)]"
              aria-hidden="true"
            />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
