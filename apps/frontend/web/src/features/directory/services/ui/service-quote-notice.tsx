import { useTranslation } from "react-i18next";
import { Button } from "@ntizo/frontend-ui";

/**
 * The right column's answer for a `quote` service, in place of `PackageChooser`.
 *
 * `PackageChooser` renders nothing at all when `options` is empty — correctly,
 * per its own doc comment: there is no honest total to show until the provider
 * has priced the job. Left there, that "nothing" propagated up: nothing else
 * in the plan put any affordance in this slot for a quote service, so the page
 * offered a customer no explanation and no next step at all. This is the
 * page's own answer, not the chooser's — `service-detail-page.tsx` composes
 * one or the other depending on `service.options.length`, and `PackageChooser`
 * itself, and its tests, are unchanged.
 *
 * The explanation reuses `availabilityQuoteNotice` rather than introducing a
 * near-identical sentence: `AvailabilitySheet` already says "priced by quote,
 * contact the provider to get a price" for the same fact in the calendar
 * panel, and a second string saying the same thing in different words is a
 * second place for the two to drift apart. `priceByQuote` ("By quote") was
 * also considered and rejected — it is a price-tag label built for a browse
 * card, too terse to stand alone as the only content in this slot.
 *
 * The "Falar com o prestador" button gets the same disabled, unlinked
 * treatment `PackageChooser` gives "Reservar" — not because there is nothing
 * to wire it to any more (`features/messaging` exists now, and
 * `provider-hero.tsx`'s `MessageProviderButton` already wires the identical
 * CTA to `useStartThread` a few features over), but because nobody has come
 * back to wire this one now that the reason it was disabled no longer
 * holds. See follow-up #69.
 */
export function ServiceQuoteNotice() {
  const { t } = useTranslation("directory");

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
      <p className="type-body text-[var(--color-muted-foreground)]">
        {t("availabilityQuoteNotice")}
      </p>
      <div className="mt-4 grid gap-2">
        <Button type="button" variant="secondary" disabled className="w-full">
          {t("packageContactProvider")}
        </Button>
        <p className="type-caption text-center text-[var(--color-muted-foreground)]">
          {t("packageContactClosed")}
        </p>
      </div>
    </div>
  );
}
