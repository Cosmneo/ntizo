import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, ChoiceChips, ChoiceChipsMulti, Input, Sheet, SheetContent } from "@ntizo/frontend-ui";
import { Field } from "@/shared/components/wizard/wizard-chrome";
import {
  WEEKDAY_ORDER,
  formatDayList,
  formatHours,
  labelToMinutes,
  minutesToLabel,
  overlaps,
  weekdayDisplayIndex,
  weekdayLabel,
  type WeekRuleGroup,
} from "../domain/week";
import type { WeeklyRuleDraft } from "../domain/types";

/**
 * The editor for one weekly rule: which days, from when to when, and — at its
 * foot — a sentence naming what that produces before anything is committed.
 *
 * The sentence is the point of the drawer. A form that only refuses bad input
 * leaves somebody to work out in their head what "09:00 to 17:00 on three
 * days" comes to; this says it while they type, in the same words the card and
 * the week beside it will use afterwards.
 *
 * It hands rules back rather than saving them. Persisting a whole week is one
 * call (`setWeeklyPattern` replaces the lot), so the drawer's job ends at
 * producing rows and the decision to write them belongs one level up, where
 * the rest of the draft lives.
 *
 * Field state is seeded from `initial` at mount and never re-synced. The
 * parent gives it a `key` per opening, which is what makes "open on this
 * group" work without an effect that could fire again mid-edit.
 */
export function RuleDrawer({
  open,
  onOpenChange,
  locale,
  initial,
  others,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  /** The group being edited, or `null` when adding a new one. */
  initial: WeekRuleGroup | null;
  /**
   * Every other rule in the draft — the overlap check's other side. The group
   * under edit is deliberately absent: it is being replaced, so it cannot
   * conflict with itself.
   */
  others: readonly WeeklyRuleDraft[];
  onSubmit: (rules: WeeklyRuleDraft[]) => void;
}) {
  const { t } = useTranslation("provider");
  const titleId = useId();
  const timeErrorId = useId();

  const [days, setDays] = useState<string[]>(() => (initial?.weekdays ?? []).map(String));
  const [start, setStart] = useState(() => minutesToLabel(initial?.startMinute ?? 9 * 60));
  const [end, setEnd] = useState(() => minutesToLabel(initial?.endMinute ?? 17 * 60));
  // Raw text, not the parsed number: an empty box and a box holding "0" are
  // different things to a reader, and collapsing them into one numeric state
  // the moment a key is pressed would lose that difference before it could
  // ever reach the "empty means null" parse below.
  //
  // Seeded from `initial`, not always blank: editing an existing group must
  // open on the shape it was actually saved with — `null` renders as an
  // empty box (the placeholder already names the default), a real number
  // renders as itself, `0` included, so a saved "no buffer" and an untouched
  // field never look alike.
  const [buffer, setBuffer] = useState(() =>
    initial?.bufferMinutes != null ? String(initial.bufferMinutes) : "",
  );
  // "" is itself a real choice on this control — "use the default" — not an
  // unset placeholder the way it is for `buffer`/`capacity`; see the options
  // list below. A saved `0` still seeds `"0"`, which is the "No slots" chip,
  // never the "use the default" one.
  const [grid, setGrid] = useState(() =>
    initial?.slotIntervalMinutes != null ? String(initial.slotIntervalMinutes) : "",
  );
  const [capacity, setCapacity] = useState(() =>
    initial?.capacity != null ? String(initial.capacity) : "",
  );
  const [error, setError] = useState<
    { field: "days" | "times" | "buffer" | "capacity"; message: string } | null
  >(null);

  const startMinute = labelToMinutes(start);
  const endMinute = labelToMinutes(end);
  const weekdays = days
    .map(Number)
    .sort((a, b) => weekdayDisplayIndex(a) - weekdayDisplayIndex(b));

  // Untouched → `null`, the same instruction as "use the default" — and
  // never the default's own number, or a rule nobody ever set a buffer on
  // would stop following the default the moment somebody changed it.
  const bufferMinutes = buffer.trim() === "" ? null : Number(buffer);
  const slotIntervalMinutes = grid === "" ? null : Number(grid);
  const capacityValue = capacity.trim() === "" ? null : Number(capacity);

  function rulesFrom(s: number, e: number): WeeklyRuleDraft[] {
    return weekdays.map((weekday) => ({
      weekday,
      startMinute: s,
      endMinute: e,
      bufferMinutes,
      slotIntervalMinutes,
      capacity: capacityValue,
    }));
  }

  function submit() {
    if (weekdays.length === 0) {
      setError({ field: "days", message: t("availabilityRuleDaysRequired") });
      return;
    }
    if (startMinute === null || endMinute === null) {
      setError({ field: "times", message: t("availabilityInvalidTime") });
      return;
    }
    if (endMinute <= startMinute) {
      setError({ field: "times", message: t("availabilityEndBeforeStart") });
      return;
    }
    // A usability guard, not an invariant — the server never refuses this and
    // the engine merges overlapping rules harmlessly. Refused here only so
    // nobody has to work out why two rules they just wrote read as one.
    const clash = rulesFrom(startMinute, endMinute).some((rule) => overlaps(others, rule));
    if (clash) {
      setError({ field: "times", message: t("availabilityOverlap") });
      return;
    }
    // Same reasoning as the capacity guard below: `Number("15 min")` is `NaN`,
    // and `JSON.stringify(NaN)` is `null` — indistinguishable from an
    // untouched box on the wire, so this would silently save "use the
    // default" instead of refusing the input.
    if (bufferMinutes !== null && (!Number.isFinite(bufferMinutes) || bufferMinutes < 0)) {
      setError({ field: "buffer", message: t("availabilityRuleBufferInvalid") });
      return;
    }
    // `Number.isFinite` rather than a bare range check — a non-numeric box
    // parses to `NaN`, and `NaN < 1` is `false`, which would let garbage text
    // through as a silent "use the default" instead of being refused.
    if (capacityValue !== null && (!Number.isFinite(capacityValue) || capacityValue < 1)) {
      setError({ field: "capacity", message: t("availabilityRuleCapacityInvalid") });
      return;
    }
    setError(null);
    onSubmit(rulesFrom(startMinute, endMinute));
    onOpenChange(false);
  }

  const timeError = error?.field === "times" ? error.message : null;
  const bufferError = error?.field === "buffer" ? error.message : undefined;
  const capacityError = error?.field === "capacity" ? error.message : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-5">
        <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="grid gap-5">
          <h2 id={titleId} className="type-h3 font-semibold">
            {initial ? t("availabilityRuleEditTitle") : t("availabilityRuleNewTitle")}
          </h2>

          <ChoiceChipsMulti
            name="availability-rule-days"
            legend={t("availabilityRuleDays")}
            showLegend
            options={WEEKDAY_ORDER.map((weekday) => ({
              value: String(weekday),
              label: weekdayLabel(locale, weekday),
            }))}
            value={days}
            onChange={(next) => {
              setDays(next);
              setError(null);
            }}
            error={error?.field === "days" ? error.message : undefined}
          />

          <div className="grid gap-2">
            <div className="flex gap-3">
              <TimeField
                id="availability-rule-start"
                label={t("availabilityStart")}
                value={start}
                describedBy={timeError ? timeErrorId : undefined}
                onChange={(v) => {
                  setStart(v);
                  setError(null);
                }}
              />
              <TimeField
                id="availability-rule-end"
                label={t("availabilityEnd")}
                value={end}
                describedBy={timeError ? timeErrorId : undefined}
                onChange={(v) => {
                  setEnd(v);
                  setError(null);
                }}
              />
            </div>
            {/* Under the fields and named by them — a message a sighted reader
                finds by looking down and everybody else finds by the same
                association the label uses. */}
            {timeError && (
              <p id={timeErrorId} className="type-caption text-[var(--color-destructive)]">
                {timeError}
              </p>
            )}
          </div>

          {/* This rule's own shape. No checkbox beside any of them: "leave it
              alone" and "type the number the default happens to be" are the
              same intent, and a second control to say so is a second thing
              to get wrong. An empty box is the whole answer — it maps to
              `null` on submit, not to whatever the default is today. */}
          <Field label={t("availabilityRuleBuffer")} htmlFor="rule-buffer" error={bufferError}>
            <Input
              id="rule-buffer"
              inputMode="numeric"
              value={buffer}
              onChange={(e) => {
                setBuffer(e.target.value);
                setError(null);
              }}
              placeholder={t("availabilityRuleBufferDefault")}
            />
          </Field>

          <ChoiceChips
            name="rule-grid"
            legend={t("availabilityRuleGrid")}
            showLegend
            value={grid}
            onChange={(v) => {
              setGrid(v);
              setError(null);
            }}
            options={[
              // "" and "0" read close on the page and mean opposite things:
              // one leaves the rule out of the decision entirely, the other
              // decides it — no slots, ever. Keeping them as separate options
              // rather than one "0 / default" choice is what keeps that
              // distinction reachable at all.
              { value: "", label: t("availabilityRuleGridDefault") },
              { value: "0", label: t("availabilityRuleGridNone") },
              { value: "15", label: t("serviceSlotInterval15") },
              { value: "30", label: t("serviceSlotInterval30") },
              { value: "60", label: t("serviceSlotInterval60") },
            ]}
          />

          <Field label={t("availabilityRuleCapacity")} htmlFor="rule-capacity" error={capacityError}>
            <Input
              id="rule-capacity"
              inputMode="numeric"
              value={capacity}
              onChange={(e) => {
                setCapacity(e.target.value);
                setError(null);
              }}
              placeholder={t("availabilityRuleCapacityDefault")}
            />
          </Field>

          <p className="type-body rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] p-3">
            {previewSentence()}
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("availabilityRuleCancel")}
            </Button>
            <Button type="button" size="sm" onClick={submit}>
              {t("availabilityRuleDone")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );

  function previewSentence(): string {
    if (weekdays.length === 0 || startMinute === null || endMinute === null || endMinute <= startMinute) {
      return t("availabilityRulePreviewEmpty");
    }
    return t("availabilityRulePreview", {
      days:
        weekdays.length === 7 ? t("availabilityEveryDay") : formatDayList(locale, weekdays, "long"),
      hours: `${minutesToLabel(startMinute)} – ${minutesToLabel(endMinute)}`,
      total: formatHours((endMinute - startMinute) * weekdays.length, locale),
    });
  }
}

function TimeField({
  id,
  label,
  value,
  describedBy,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  describedBy: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid w-28 gap-1.5">
      <label htmlFor={id} className="type-caption font-semibold text-[var(--color-muted-foreground)]">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        placeholder="09:00"
      />
    </div>
  );
}
