import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { ChoiceChips, Input } from "@ntizo/frontend-ui";
import {
  SLOT_INTERVAL_OPTIONS,
  parseBufferMinutes,
  type ServiceDraft,
  type ServiceFieldErrors,
  type SlotIntervalMinutes,
} from "../../domain/service-draft";

/**
 * Section 4: how the service sits in a day.
 *
 * Two fields the availability engine reads and nothing else does: the dead
 * time that follows an appointment, and the grid its start times land on.
 * Optional — a service with neither is perfectly publishable, it just packs
 * back to back on the half hour.
 *
 * The slot interval is `ChoiceChips` rather than the `Select` the old sheet
 * used: three values, each with a name worth reading, which is exactly the
 * case chips exist for.
 */
export function TimingSection({
  draft,
  setDraft,
  fieldErrors,
}: {
  draft: ServiceDraft;
  setDraft: Dispatch<SetStateAction<ServiceDraft>>;
  fieldErrors: ServiceFieldErrors;
}) {
  const { t } = useTranslation("provider");

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
          {t("serviceBuffer")}
        </span>
        <Input
          id="service-buffer"
          inputMode="numeric"
          // `0` renders as an empty box, not the digit "0" — the buffer's own
          // default is a real, legitimate zero, but showing it as literal "0"
          // would make an untouched field indistinguishable from one somebody
          // had to clear first. `String(...)` and never a locale-aware
          // formatter: a previous slice shipped `300` rendered as "300,5".
          // See `parseBufferMinutes`'s own doc comment for the other half —
          // typing never produces `NaN`, so this input never round-trips that
          // text back onto itself either.
          value={draft.bufferMinutes === 0 ? "" : String(draft.bufferMinutes)}
          onChange={(e) =>
            setDraft((d) => ({ ...d, bufferMinutes: parseBufferMinutes(e.target.value) }))
          }
          placeholder="0"
        />
        <p
          className={
            fieldErrors.bufferMinutes
              ? "type-caption text-[var(--color-destructive)]"
              : "type-caption text-[var(--color-muted-foreground)]"
          }
        >
          {fieldErrors.bufferMinutes ? t("serviceBufferError") : t("serviceBufferHint")}
        </p>
      </div>

      <ChoiceChips
        name="service-slot-interval"
        legend={t("serviceSlotInterval")}
        showLegend
        options={SLOT_INTERVAL_OPTIONS.map((n) => ({
          value: String(n),
          label: t(`serviceSlotInterval${n}`),
        }))}
        value={String(draft.slotIntervalMinutes)}
        onChange={(v) =>
          setDraft((d) => ({ ...d, slotIntervalMinutes: Number(v) as SlotIntervalMinutes }))
        }
      />
      <p className="type-caption -mt-3 text-[var(--color-muted-foreground)]">
        {t("serviceSlotIntervalHint")}
      </p>
    </div>
  );
}
