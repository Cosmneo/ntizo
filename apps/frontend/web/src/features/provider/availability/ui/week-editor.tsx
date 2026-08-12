import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, X } from "lucide-react";
import { Button, Input, Select } from "@ntizo/frontend-ui";
import { labelToMinutes, minutesToLabel, overlaps, weekdayDisplayIndex, WEEKDAY_ORDER } from "../domain/week";
import { availabilityErrorMessage, type AvailabilityMember, type WeeklyRuleDraft } from "../domain/types";
import { useSetWeeklyPattern } from "../viewmodel/use-availability";

function toDraft(weekly: AvailabilityMember["weekly"]): WeeklyRuleDraft[] {
  return weekly.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute }));
}

function compareRules(a: WeeklyRuleDraft, b: WeeklyRuleDraft): number {
  const byDay = weekdayDisplayIndex(a.weekday) - weekdayDisplayIndex(b.weekday);
  return byDay !== 0 ? byDay : a.startMinute - b.startMinute;
}

/**
 * One member's working week — the seven days, Monday first, each showing
 * the hours already set and, for whoever may edit it, a small form to add
 * more.
 *
 * The draft lives entirely in local state, seeded once when the *selected
 * member* changes and never re-synced from the fetched value after that.
 * This is deliberate: `availability.config` gets invalidated by every
 * mutation on this screen (an exception added, a closure removed elsewhere),
 * and re-running the seed on every one of those background refetches would
 * discard whatever this member's own week is mid-edit — the exact trap this
 * project has already shipped once, in the services form. Switching to a
 * *different* member is the only thing allowed to reset the draft, which is
 * why the effect below is keyed on `member.memberId`, not on `member` or
 * `member.weekly` themselves.
 */
export function WeekEditor({
  providerId,
  member,
  canEdit,
}: {
  providerId: string;
  member: AvailabilityMember;
  /**
   * Whether the signed-in caller may change *this* member's week. Read from
   * the live role and the live selected member every render — never from
   * whatever this component happened to first mount with, the same lesson
   * a previous slice's booking-mode lock paid for by reading the wrong prop.
   */
  canEdit: boolean;
}) {
  const { t } = useTranslation("provider");
  const mutation = useSetWeeklyPattern(providerId);

  const [draft, setDraft] = useState<WeeklyRuleDraft[]>(() => toDraft(member.weekly));
  const [saveError, setSaveError] = useState<string | null>(null);

  const [addWeekday, setAddWeekday] = useState<number>(WEEKDAY_ORDER[0]);
  const [addStart, setAddStart] = useState("09:00");
  const [addEnd, setAddEnd] = useState("17:00");
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toDraft(member.weekly));
    setSaveError(null);
    setAddError(null);
    mutation.reset();
    // Keyed on the member's id only — see the doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.memberId]);

  const byWeekday = useMemo(() => {
    const map = new Map<number, WeeklyRuleDraft[]>();
    for (const rule of draft) {
      const list = map.get(rule.weekday) ?? [];
      list.push(rule);
      map.set(rule.weekday, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startMinute - b.startMinute);
    return map;
  }, [draft]);

  function removeRule(target: WeeklyRuleDraft) {
    setDraft((d) => d.filter((r) => r !== target));
    mutation.reset();
  }

  function addRule() {
    const startMinute = labelToMinutes(addStart);
    const endMinute = labelToMinutes(addEnd);
    if (startMinute === null || endMinute === null) {
      setAddError(t("availabilityInvalidTime"));
      return;
    }
    if (endMinute <= startMinute) {
      setAddError(t("availabilityEndBeforeStart"));
      return;
    }
    const candidate: WeeklyRuleDraft = { weekday: addWeekday, startMinute, endMinute };
    // A usability guard, not an invariant — the server never refuses this
    // and the engine merges overlapping rules harmlessly. Refused here only
    // so nobody has to guess why two rows they just added read the same as one.
    if (overlaps(draft, candidate)) {
      setAddError(t("availabilityOverlap"));
      return;
    }
    setDraft((d) => [...d, candidate].sort(compareRules));
    setAddError(null);
    mutation.reset();
  }

  async function save() {
    setSaveError(null);
    try {
      await mutation.mutateAsync({ memberId: member.memberId, rules: draft });
    } catch (e) {
      setSaveError(availabilityErrorMessage(e, t));
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {WEEKDAY_ORDER.map((weekday) => (
          <div
            key={weekday}
            className="rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-3"
          >
            <p className="type-caption mb-2 font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
              {t(`availabilityWeekday.${weekday}`)}
            </p>
            <div className="grid gap-1.5">
              {(byWeekday.get(weekday) ?? []).length === 0 && (
                <p className="type-caption text-[var(--color-muted-foreground)]">
                  {t("availabilityNoHours")}
                </p>
              )}
              {(byWeekday.get(weekday) ?? []).map((rule) => (
                <div
                  key={`${rule.weekday}-${rule.startMinute}-${rule.endMinute}`}
                  className="flex items-center justify-between gap-2 rounded-full bg-[var(--color-muted)] px-2.5 py-1"
                >
                  <span className="type-caption">
                    {minutesToLabel(rule.startMinute)}–{minutesToLabel(rule.endMinute)}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={t("availabilityRemove")}
                      onClick={() => removeRule(rule)}
                      className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-border)]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="grid gap-2 rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] p-3.5 sm:flex sm:items-end sm:gap-3">
          <div className="grid min-w-[9rem] gap-1.5">
            <label className="type-caption font-semibold text-[var(--color-muted-foreground)]">
              {t("availabilityWeekdayLabel")}
            </label>
            <Select
              value={String(addWeekday)}
              onChange={(v) => setAddWeekday(Number(v))}
              options={WEEKDAY_ORDER.map((wd) => ({ value: String(wd), label: t(`availabilityWeekday.${wd}`) }))}
              ariaLabel={t("availabilityWeekdayLabel")}
            />
          </div>
          <div className="grid w-24 gap-1.5">
            <label className="type-caption font-semibold text-[var(--color-muted-foreground)]">
              {t("availabilityStart")}
            </label>
            <Input value={addStart} onChange={(e) => setAddStart(e.target.value)} placeholder="09:00" />
          </div>
          <div className="grid w-24 gap-1.5">
            <label className="type-caption font-semibold text-[var(--color-muted-foreground)]">
              {t("availabilityEnd")}
            </label>
            <Input value={addEnd} onChange={(e) => setAddEnd(e.target.value)} placeholder="17:00" />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addRule}>
            {t("availabilityAdd")}
          </Button>
        </div>
      )}
      {addError && <p className="type-caption text-[var(--color-destructive)]">{addError}</p>}

      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" disabled={mutation.isPending} onClick={() => void save()}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("availabilitySave")}
          </Button>
          {mutation.isSuccess && !saveError && (
            <span className="type-caption text-[var(--color-muted-foreground)]">{t("availabilitySaved")}</span>
          )}
        </div>
      )}
      {saveError && <p className="type-body text-[var(--color-destructive)]">{saveError}</p>}
    </div>
  );
}
