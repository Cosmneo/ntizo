import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import { Button, DatePicker, Input, cn } from "@ntizo/frontend-ui";
import { labelToMinutes, minutesToLabel } from "../domain/week";
import {
  availabilityErrorMessage,
  type AvailabilityMember,
  type ExceptionKind,
} from "../domain/types";
import { useAddException, useRemoveException } from "../viewmodel/use-availability";

import { DateBadge, EmptyState } from "./entry";

/**
 * One member's date exceptions — closed days and days worked on a different
 * schedule than usual.
 *
 * The add form resets whenever the selected member changes, the same rule
 * the week editor follows: a date half-typed for one person must not end up
 * filed under whoever the picker lands on next.
 */
export function ExceptionsPanel({
  providerId,
  member,
  canEdit,
}: {
  providerId: string;
  member: AvailabilityMember;
  canEdit: boolean;
}) {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const addMutation = useAddException(providerId);
  const removeMutation = useRemoveException(providerId);

  const [onDate, setOnDate] = useState("");
  const [kind, setKind] = useState<ExceptionKind>("closed");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [note, setNote] = useState("");
  // The form is closed until asked for. It used to sit permanently open — a
  // grey box of five fields for something a provider does twice a year — which
  // is most of the visual weight this panel carried.
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    setAdding(false);
    setOnDate("");
    setKind("closed");
    setStart("09:00");
    setEnd("17:00");
    setNote("");
    setFormError(null);
    setRemoveError(null);
  }, [member.memberId]);

  async function submit() {
    setFormError(null);
    if (!onDate) {
      setFormError(t("availabilityExceptionDateRequired"));
      return;
    }
    let startMinute: number | null = null;
    let endMinute: number | null = null;
    if (kind === "custom") {
      startMinute = labelToMinutes(start);
      endMinute = labelToMinutes(end);
      if (startMinute === null || endMinute === null) {
        setFormError(t("availabilityInvalidTime"));
        return;
      }
      if (endMinute <= startMinute) {
        setFormError(t("availabilityEndBeforeStart"));
        return;
      }
    }
    try {
      await addMutation.mutateAsync({
        memberId: member.memberId,
        onDate,
        kind,
        // Explicit `null` for a closed day — the mutation distinguishes
        // "no hours" from "leave it alone", and only `null` says the former.
        startMinute,
        endMinute,
        note: note.trim() || null,
      });
      setOnDate("");
      setNote("");
      // Closed again once it has landed: the list below is the confirmation,
      // and a form still open reads as a second one waiting to be filled.
      setAdding(false);
    } catch (e) {
      setFormError(availabilityErrorMessage(e, t));
    }
  }

  async function remove(exceptionId: string) {
    setRemoveError(null);
    try {
      await removeMutation.mutateAsync({ memberId: member.memberId, exceptionId });
    } catch (e) {
      setRemoveError(availabilityErrorMessage(e, t));
    }
  }

  const sorted = [...member.exceptions].sort((a, b) => a.onDate.localeCompare(b.onDate));

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {sorted.length === 0 && <EmptyState>{t("availabilityExceptionsEmpty")}</EmptyState>}
        {sorted.map((exception) => {
          const hours =
            exception.kind === "closed"
              ? t("availabilityExceptionKindClosed")
              : `${minutesToLabel(exception.startMinute ?? 0)}–${minutesToLabel(exception.endMinute ?? 0)}`;
          return (
            <div
              key={exception.id}
              className="flex items-center gap-2.5 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] py-2 pr-2 pl-2.5"
            >
              <DateBadge
                iso={exception.onDate}
                locale={locale}
                tone={exception.kind === "closed" ? "danger" : "warning"}
              />
              <div className="grid min-w-0 flex-1">
                {/* The note leads when there is one — "Staff training" is what
                    somebody scans for, and the hours repeat what the badge and
                    the week beside it already said. */}
                <p className="type-body-medium truncate font-medium">{exception.note || hours}</p>
                <p className="type-caption truncate tabular-nums text-[var(--color-muted-foreground)]">
                  {exception.note ? hours : t(`availabilityExceptionKind${exception.kind === "closed" ? "Closed" : "Custom"}`)}
                </p>
              </div>
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 px-2"
                  disabled={removeMutation.isPending}
                  onClick={() => void remove(exception.id)}
                >
                  {t("availabilityRemove")}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {removeError && <p className="type-body text-[var(--color-destructive)]">{removeError}</p>}

      {canEdit && !adding && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            {t("availabilityExceptionAdd")}
          </Button>
        </div>
      )}

      {canEdit && adding && (
        <div className="grid gap-3 rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] p-3.5">
          <div className="grid gap-3 @sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
                {t("availabilityExceptionDate")}
              </span>
              <DatePicker
                id="exception-date"
                value={onDate}
                onChange={setOnDate}
                locale={locale}
                placeholder={t("availabilityExceptionDate")}
                todayLabel={t("datePickerToday")}
                clearLabel={t("datePickerClear")}
                monthLabel={t("datePickerMonth")}
                yearLabel={t("datePickerYear")}
                yearSearchPlaceholder={t("datePickerYearSearch")}
              />
            </div>
            <div className="grid gap-1.5">
              <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
                {t("availabilityExceptionKind")}
              </span>
              <div role="radiogroup" aria-label={t("availabilityExceptionKind")} className="flex gap-2">
                {(["closed", "custom"] as const).map((option) => {
                  const selected = kind === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setKind(option)}
                      className={cn(
                        "type-body rounded-full border px-4 py-2 text-left transition-colors",
                        selected
                          ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] font-semibold text-[var(--color-primary)]"
                          : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
                      )}
                    >
                      {t(`availabilityExceptionKind${option === "closed" ? "Closed" : "Custom"}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {kind === "custom" && (
            <div className="grid grid-cols-2 gap-3 @sm:w-64">
              <div className="grid gap-1.5">
                <span className="type-caption font-semibold text-[var(--color-muted-foreground)]">
                  {t("availabilityStart")}
                </span>
                <Input value={start} onChange={(e) => setStart(e.target.value)} placeholder="09:00" />
              </div>
              <div className="grid gap-1.5">
                <span className="type-caption font-semibold text-[var(--color-muted-foreground)]">
                  {t("availabilityEnd")}
                </span>
                <Input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="17:00" />
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <span className="type-caption font-semibold text-[var(--color-muted-foreground)]">
              {t("availabilityExceptionNote")}
            </span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {formError && <p className="type-caption text-[var(--color-destructive)]">{formError}</p>}

          {/* One row, not two grid cells. A `Button` left to be a grid item
              stretches to the track's full width and centres its own label,
              which is why the cancel sat adrift under a left-aligned submit. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={addMutation.isPending}
              onClick={() => void submit()}
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("availabilityExceptionAdd")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              // Tighter than a button's own padding: this is the way out of a
              // form, not a second thing to do in it, and the room it gives
              // back is what keeps the pair on one line in a 300px pane.
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
