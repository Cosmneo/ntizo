import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { ChoiceChips } from "@ntizo/frontend-ui";
import type { ServiceDraft } from "../../domain/service-draft";
import type { ServiceBookingMode } from "../../domain/types";

/**
 * Step 2: how the service is charged — the question only, never the amounts.
 *
 * This is the first half of the editor's old `PricingSection`. That component
 * asked the mode and collected the options on one screen, and hid the second
 * half behind a `showOptionsEditor` flag, because `service.options.add` is
 * addressed by a service id that does not exist until the first save. The
 * wizard says the same thing with its running order instead: the mode is
 * asked here, before `CREATES_SERVICE`, and the amounts on the `pricing` step
 * after it.
 *
 * `bookingMode` is still only choosable before that first save.
 * `service.update` carries no field for it, because changing it under a
 * service that already has priced options (or a quote form) leaves one of the
 * two in a shape the other invariant refuses.
 */
export function StepBooking({
  draft,
  setDraft,
  canChangeBookingMode,
}: {
  draft: ServiceDraft;
  setDraft: Dispatch<SetStateAction<ServiceDraft>>;
  canChangeBookingMode: boolean;
}) {
  const { t } = useTranslation("provider");

  return (
    <div className="grid gap-1.5">
      <ChoiceChips
        name="service-booking-mode"
        legend={t("serviceBookingModeQuestion")}
        showLegend
        value={draft.bookingMode}
        onChange={(v) => setDraft((d) => ({ ...d, bookingMode: v as ServiceBookingMode }))}
        options={[
          {
            value: "priced",
            label: t("serviceBookingMode.priced"),
            disabled: !canChangeBookingMode,
          },
          {
            value: "quote",
            label: t("serviceBookingMode.quote"),
            disabled: !canChangeBookingMode,
          },
        ]}
      />
      <p className="type-caption text-[var(--color-muted-foreground)]">
        {canChangeBookingMode
          ? t(
              draft.bookingMode === "priced"
                ? "serviceBookingModeHint"
                : "serviceBookingModeQuoteHint",
            )
          : t("serviceBookingModeLocked")}
      </p>
    </div>
  );
}
