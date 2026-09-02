import { useTranslation } from "react-i18next";
import { MessageProviderButton } from "@/features/directory/ui/provider-rail";

/**
 * The right column's answer for a `quote` service, in place of the price rail.
 *
 * A quote service carries no priced option, so there is no honest total to
 * show until the provider has seen the job — which is why `RailPriceSummary`
 * is not merely rendered empty here. An empty rail leaves a customer with no
 * explanation and no next step at all, and that "nothing" is exactly what
 * this exists to replace. `serviceDetailPanel` (`domain/service-card.ts`) is
 * the one place the choice between the three is made, keyed off `bookingMode`
 * rather than off `options.length`.
 *
 * The explanation reuses `availabilityQuoteNotice` rather than introducing a
 * near-identical sentence: checkout's own step 1 says "priced by quote,
 * contact the provider to get a price" for the same fact if a quote service
 * is ever reached there, and a second string saying the same thing in
 * different words is a second place for the two to drift apart.
 * `priceByQuote` ("By quote") was also considered and rejected — it is a
 * price-tag label built for a browse card, too terse to stand alone as the
 * only content in this slot.
 *
 * **There is deliberately no link into checkout here.** `booking.create`
 * takes a `serviceOptionId` and a quote service has no priced option to hand
 * it, so a "see availability" link beside this sentence would open a page
 * that could only repeat the sentence and offer nothing to press. The
 * routing change that deleted `AvailabilitySheet` did not change that: a
 * quote service starts with a conversation, not with a held slot.
 *
 * **The "contact provider" button actually works.** A quote service can
 * be neither booked nor scheduled — there is no fixed price or duration to
 * check a calendar against — so this button is the only action its page
 * offers, and rendering it disabled behind a sentence claiming messaging
 * "isn't open on Ntizo yet" was false: messaging shipped, `RailPriceSummary`
 * (the sibling branch of this same `serviceDetailPanel` choice, one file
 * over) already mounts the identical `MessageProviderButton`, and so does the
 * provider page itself. Closes follow-up #69.
 */
export function ServiceQuoteNotice({ providerId }: { providerId: string }) {
  const { t } = useTranslation("directory");

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
      <p className="type-body text-[var(--color-muted-foreground)]">
        {t("availabilityQuoteNotice")}
      </p>
      <div className="mt-4 grid gap-2">
        <MessageProviderButton providerId={providerId} />
      </div>
    </div>
  );
}
