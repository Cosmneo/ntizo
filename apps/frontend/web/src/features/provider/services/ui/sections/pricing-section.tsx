import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { ChoiceChips } from "@ntizo/frontend-ui";
import { OptionsEditor } from "../options-editor";
import type { ServiceDraft } from "../../domain/service-draft";
import type { ServiceBookingMode, ServiceOption } from "../../domain/types";

/**
 * Section 2: how the service is charged.
 *
 * Booking mode is a `ChoiceChips` pair rather than the old bespoke pill
 * group — same set of two, same reason chips replace `Select` everywhere
 * else in this editor. What did not move: `bookingMode` is still only
 * choosable before the first save (`canChangeBookingMode`), and the options
 * editor still only appears once a real `serviceId` exists and the mode is
 * `priced` (`showOptionsEditor`) — both booking mode and the options list
 * become unrecoverable mismatches otherwise, exactly as `service-form.tsx`'s
 * own comments already documented.
 */
export function PricingSection({
  draft,
  setDraft,
  providerId,
  serviceId,
  options,
  canChangeBookingMode,
  showOptionsEditor,
}: {
  draft: ServiceDraft;
  setDraft: Dispatch<SetStateAction<ServiceDraft>>;
  providerId: string;
  /** Null until the service has been saved at least once. */
  serviceId: string | null;
  /** The saved service's own options — empty for one that doesn't exist yet. */
  options: readonly ServiceOption[];
  canChangeBookingMode: boolean;
  showOptionsEditor: boolean;
}) {
  const { t } = useTranslation("provider");

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <ChoiceChips
          name="service-booking-mode"
          legend={t("serviceBookingModeQuestion")}
          showLegend
          value={draft.bookingMode}
          onChange={(v) =>
            setDraft((d) => ({ ...d, bookingMode: v as ServiceBookingMode }))
          }
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

      {draft.bookingMode === "priced" &&
        (showOptionsEditor && serviceId ? (
          <OptionsEditor
            providerId={providerId}
            serviceId={serviceId}
            sourceLocale={draft.sourceLocale}
            options={options}
          />
        ) : (
          <p className="type-body rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] px-3.5 py-2.5 text-[var(--color-muted-foreground)]">
            {t("serviceOptionsSaveFirst")}
          </p>
        ))}

      {draft.bookingMode === "quote" && (
        <p className="type-body rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] px-3.5 py-2.5 text-[var(--color-muted-foreground)]">
          {t("serviceOptionsQuoteNote")}
        </p>
      )}
    </div>
  );
}
