import { useTranslation } from "react-i18next";
import { cn } from "@ntizo/frontend-ui";
import type { QuoteExpiredCause, QuoteStatus } from "@ntizo/shared";
import { momentWording } from "@/features/checkout/domain/slot-wording";
import {
  TONE_CLASS,
  clockOf,
  coarseDuration,
  customerTone,
  providerTone,
} from "@/features/quotes/domain/status";

/**
 * The slice of a quote `QuoteStatusLine` actually reads — the fields
 * `clockOf` needs, plus the timezone the clock is written in. Both
 * `CustomerQuoteDTO` and `ProviderQuoteDTO` (and their detail counterparts)
 * carry every one of these, so either reaches this component unchanged.
 */
export interface QuoteLike {
  status: QuoteStatus;
  expiresAt: string | null;
  expiredCause: QuoteExpiredCause | null;
  closedReason: string | null;
  requestedAt: string;
  proposal: { validUntil: string } | null;
  timezone: string;
}

/**
 * The status, as a dot and words, plus the clock line that says what the dot
 * means in time.
 *
 * Not a pill: a quote's status is a sentence about whose turn it is, and a
 * pill reads as a category. The two sides get different sentences for the
 * same status because they are asking different questions — the customer at
 * `REQUESTED` is waiting, the provider at `REQUESTED` is owed.
 *
 * **`becameBooking` and `closedReason` render nothing on the provider side.**
 * `clock.provider.*` carries no keys for either: a provider who declined or
 * withdrew already knows their own reason without this line repeating it
 * back, and `status.provider.ACCEPTED` ("Aceite") already says the job is
 * theirs without a second sentence pointing at the booking. The customer
 * gets both, because for them each is new information.
 */
export function QuoteStatusLine({
  quote,
  side,
  now,
}: {
  quote: QuoteLike;
  side: "customer" | "provider";
  now: Date;
}) {
  const { t, i18n } = useTranslation("quotes");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const tone = side === "customer" ? customerTone(quote.status) : providerTone(quote.status);
  const clock = clockOf(quote);

  const at = (iso: string) => {
    const { date, time } = momentWording(iso, locale, quote.timezone);
    return `${date}, ${time}`;
  };
  const span = (iso: string) => {
    const left = coarseDuration(new Date(iso).getTime() - now.getTime());
    return left === null ? null : t(`unit.${left.unit}`, { count: left.count });
  };

  let line: string | null;
  switch (clock.kind) {
    case "respondBy": {
      if (side === "customer") {
        line = t("clock.customer.respondBy", { when: at(clock.at) });
        break;
      }
      // The provider's own deadline: a countdown while it is still running,
      // and a plain "prazo passado" once `span` has nothing left to count —
      // `coarseDuration` returns `null` exactly when the clock has run out.
      const left = span(clock.at);
      line =
        left === null
          ? t("clock.provider.overdue", { when: at(clock.at) })
          : t("clock.provider.answerBy", { when: at(clock.at), left });
      break;
    }
    case "decideBy":
      line =
        side === "customer"
          ? t("clock.customer.yourDecision", { when: at(clock.at) })
          : t("clock.provider.validUntil", { when: at(clock.at) });
      break;
    case "becameBooking":
      line = side === "customer" ? t("clock.customer.becameBooking") : null;
      break;
    case "closedReason":
      // The reason is a raw token off the write side (a decline or reject
      // reason, or the fixed "withdrawn"). `close.reason.*` translates the
      // seven decline/reject tokens; a token with no entry there — only
      // "withdrawn" — falls back to itself rather than to a bare key id.
      line =
        side === "customer"
          ? t("clock.customer.closedReason", {
              reason: t(`close.reason.${clock.reason}`, { defaultValue: clock.reason }),
            })
          : null;
      break;
    case "expired":
      if (side === "customer") {
        line =
          clock.cause === "provider_did_not_respond"
            ? t("clock.customer.providerDidNotRespond", { when: at(clock.at) })
            : t("clock.customer.proposalLapsed", { when: at(clock.at) });
      } else {
        line =
          clock.cause === "provider_did_not_respond"
            ? t("clock.provider.didNotRespond", { when: at(clock.at) })
            : t("clock.provider.customerDidNotDecide", { when: at(clock.at) });
      }
      break;
    case "none":
      line = null;
      break;
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", TONE_CLASS[tone])} />
        <span className="type-body-medium font-semibold">{t(`status.${side}.${quote.status}`)}</span>
      </span>
      {line && (
        <span className="type-caption text-[var(--color-muted-foreground)]">{line}</span>
      )}
    </span>
  );
}
