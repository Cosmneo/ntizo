import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@ntizo/frontend-ui";
import { compareRules, groupRules, type WeekRuleGroup } from "../domain/week";
import { availabilityErrorMessage, type WeeklyRuleDraft } from "../domain/types";
import { useSetWeeklyPattern } from "../viewmodel/use-availability";
import { RuleCard } from "./rule-card";
import { RuleDrawer } from "./rule-drawer";

/**
 * One member's working week as a short list of rules, each openable in a
 * drawer, with one save for the lot.
 *
 * The draft itself lives one level up, in the page, because the week drawn on
 * the right is the same data: a rule added here has to change that picture
 * before anything is sent anywhere, and state a sibling needs cannot live in
 * this component. What stays here is the editing — which group is open, and
 * the single call that writes the whole week.
 *
 * `setWeeklyPattern` replaces a member's entire week in one call, so there is
 * no per-row mutation to make and no id to keep: the draft is the request
 * body, and Save is the only moment anything leaves the browser.
 */
export function WeekRules({
  providerId,
  memberId,
  canEdit,
  locale,
  rules,
  onChange,
}: {
  providerId: string;
  memberId: string;
  /**
   * Whether the signed-in caller may change *this* member's week — read from
   * the live role and the live selection every render, never from whatever
   * this component first mounted with.
   */
  canEdit: boolean;
  locale: string;
  rules: readonly WeeklyRuleDraft[];
  onChange: (rules: WeeklyRuleDraft[]) => void;
}) {
  const { t } = useTranslation("provider");
  const mutation = useSetWeeklyPattern(providerId);
  const [editing, setEditing] = useState<{ group: WeekRuleGroup | null } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const groups = groupRules(rules);
  /** Everything outside the group being edited — it is replaced, so it cannot clash with itself. */
  const others = editing?.group ? withoutGroup(rules, editing.group) : rules;

  function commit(next: WeeklyRuleDraft[]) {
    onChange([...next].sort(compareRules));
    mutation.reset();
    setSaveError(null);
  }

  async function save() {
    setSaveError(null);
    try {
      await mutation.mutateAsync({ memberId, rules: [...rules] });
    } catch (e) {
      setSaveError(availabilityErrorMessage(e, t));
    }
  }

  return (
    <div className="grid gap-3">
      {groups.length === 0 && (
        <p className="type-body text-[var(--color-muted-foreground)]">{t("availabilityNoHours")}</p>
      )}

      {groups.map((group) => (
        <RuleCard
          key={group.id}
          group={group}
          locale={locale}
          canEdit={canEdit}
          onEdit={() => setEditing({ group })}
          onRemove={() => commit(withoutGroup(rules, group))}
        />
      ))}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing({ group: null })}>
            <Plus className="h-4 w-4" />
            {t("availabilityRuleAdd")}
          </Button>
          <Button type="button" size="sm" disabled={mutation.isPending} onClick={() => void save()}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("availabilitySave")}
          </Button>
          {mutation.isSuccess && !saveError && (
            <span className="type-caption text-[var(--color-muted-foreground)]">
              {t("availabilitySaved")}
            </span>
          )}
        </div>
      )}
      {saveError && <p className="type-body text-[var(--color-destructive)]">{saveError}</p>}

      {/* Mounted only while open, and keyed on the group — that is what seeds
          the drawer's fields, instead of an effect that could fire again while
          somebody is halfway through typing in them. */}
      {editing && (
        <RuleDrawer
          key={editing.group?.id ?? "new"}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          locale={locale}
          initial={editing.group}
          others={others}
          onSubmit={(next) => commit([...withoutGroup(rules, editing.group), ...next])}
        />
      )}
    </div>
  );
}

/**
 * The draft minus one group. Matched on the hours rather than on object
 * identity: `groupRules` rebuilds its rows, so the group a card hands back is
 * never the same object as the one in the draft.
 */
function withoutGroup(
  rules: readonly WeeklyRuleDraft[],
  group: WeekRuleGroup | null,
): WeeklyRuleDraft[] {
  if (!group) return [...rules];
  return rules.filter(
    (r) => !(r.startMinute === group.startMinute && r.endMinute === group.endMinute),
  );
}
