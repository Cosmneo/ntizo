import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import { Button, DatePicker, Input } from "@ntizo/frontend-ui";
import { availabilityErrorMessage, type HouseClosure } from "../domain/types";
import { useAddClosure, useRemoveClosure } from "../viewmodel/use-availability";

/** `YYYY-MM-DD`, read as a UTC instant so the browser's own timezone never shifts it to the day before or after. */
function formatDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Closing the whole workspace for a date range — holidays, a week off, the
 * business shut for stock-taking. Not per-member: a closure has no member of
 * its own, it blocks every one of them at once.
 *
 * Only ever rendered for an owner or admin — see `AvailabilityPage` — but the
 * server checks that independently (`NOT_PROVIDER_OWNER_OR_ADMIN`), so this
 * component does not re-derive the permission itself.
 */
export function ClosuresPanel({ providerId, closures }: { providerId: string; closures: HouseClosure[] }) {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const addMutation = useAddClosure(providerId);
  const removeMutation = useRemoveClosure(providerId);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [note, setNote] = useState("");
  // Closed until asked for. A workspace closes for the holidays perhaps twice
  // a year; a form held permanently open for it was most of this panel's
  // visual weight.
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function submit() {
    setFormError(null);
    if (!fromDate || !toDate) {
      setFormError(t("availabilityClosureDatesRequired"));
      return;
    }
    if (toDate < fromDate) {
      setFormError(t("availabilityClosureRangeInvalid"));
      return;
    }
    try {
      await addMutation.mutateAsync({ fromDate, toDate, note: note.trim() || null });
      setFromDate("");
      setToDate("");
      setNote("");
      // Closed again once it has landed: the list above is the confirmation,
      // and a form still open reads as a second one waiting to be filled.
      setAdding(false);
    } catch (e) {
      setFormError(availabilityErrorMessage(e, t));
    }
  }

  async function remove(closureId: string) {
    setRemoveError(null);
    try {
      await removeMutation.mutateAsync(closureId);
    } catch (e) {
      setRemoveError(availabilityErrorMessage(e, t));
    }
  }

  const sorted = [...closures].sort((a, b) => a.fromDate.localeCompare(b.fromDate));

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {sorted.length === 0 && (
          <p className="type-body text-[var(--color-muted-foreground)]">{t("availabilityClosuresEmpty")}</p>
        )}
        {sorted.map((closure) => (
          <div
            key={closure.id}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <p className="type-body-medium font-semibold">
                {formatDate(closure.fromDate, locale)} – {formatDate(closure.toDate, locale)}
              </p>
              {closure.note && (
                <p className="type-caption text-[var(--color-muted-foreground)]">{closure.note}</p>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={removeMutation.isPending}
              onClick={() => void remove(closure.id)}
            >
              {t("availabilityRemove")}
            </Button>
          </div>
        ))}
      </div>
      {removeError && <p className="type-body text-[var(--color-destructive)]">{removeError}</p>}

      {!adding && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            {t("availabilityClosureAdd")}
          </Button>
        </div>
      )}

      {adding && (
      <div className="grid gap-3 rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] p-3.5">
        <div className="grid gap-3 @sm:grid-cols-2">
          <div className="grid gap-1.5">
            <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
              {t("availabilityClosureFrom")}
            </span>
            <DatePicker
              id="closure-from"
              value={fromDate}
              onChange={setFromDate}
              locale={locale}
              placeholder={t("availabilityClosureFrom")}
              todayLabel={t("datePickerToday")}
              clearLabel={t("datePickerClear")}
              monthLabel={t("datePickerMonth")}
              yearLabel={t("datePickerYear")}
              yearSearchPlaceholder={t("datePickerYearSearch")}
            />
          </div>
          <div className="grid gap-1.5">
            <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
              {t("availabilityClosureTo")}
            </span>
            <DatePicker
              id="closure-to"
              value={toDate}
              onChange={setToDate}
              locale={locale}
              min={fromDate || undefined}
              placeholder={t("availabilityClosureTo")}
              todayLabel={t("datePickerToday")}
              clearLabel={t("datePickerClear")}
              monthLabel={t("datePickerMonth")}
              yearLabel={t("datePickerYear")}
              yearSearchPlaceholder={t("datePickerYearSearch")}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <span className="type-caption font-semibold text-[var(--color-muted-foreground)]">
            {t("availabilityClosureNote")}
          </span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {formError && <p className="type-caption text-[var(--color-destructive)]">{formError}</p>}

        {/* One row, not two grid cells — see the same pairing in
            `exceptions-panel.tsx`. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={addMutation.isPending}
            onClick={() => void submit()}
          >
            {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("availabilityClosureAdd")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            // Tighter than a button's own padding: this is the way out of a
            // form, not a second thing to do in it, and the room it gives back
            // is what keeps the pair on one line in a 300px pane.
            className="px-2"
            onClick={() => {
              setAdding(false);
              setFormError(null);
            }}
          >
            {t("availabilityRuleCancel")}
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}
