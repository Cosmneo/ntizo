import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@ntizo/frontend-ui";
import { compareRules, groupRules, type WeekRuleGroup } from "../domain/week";
import type { WeeklyRuleDraft } from "../domain/types";
import { RuleCard } from "./rule-card";
import { RuleDrawer } from "./rule-drawer";

/**
 * One member's working week as a short list of rules, each openable in a
 * drawer.
 *
 * The draft itself lives one level up, in the page, because the week drawn
 * beside it is the same data: a rule added here has to change that picture
 * before anything is sent anywhere, and state a sibling needs cannot live in
 * this component. What stays here is the editing — which group is open.
 *
 * Saving left too. It used to be a button sitting under these cards
 * permanently, which asserted there was always pending work; the page now
 * raises a bar when, and only when, the draft actually differs from what was
 * fetched. `setWeeklyPattern` still replaces a member's entire week in one
 * call, so the draft is the request body and there is no per-row mutation.
 */
export function WeekRules({
  canEdit,
  locale,
  rules,
  onChange,
}: {
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
  const [editing, setEditing] = useState<{ group: WeekRuleGroup | null } | null>(null);

  const groups = groupRules(rules);
  /** Everything outside the group being edited — it is replaced, so it cannot clash with itself. */
  const others = editing?.group ? withoutGroup(rules, editing.group) : rules;

  function commit(next: WeeklyRuleDraft[]) {
    onChange([...next].sort(compareRules));
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
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing({ group: null })}>
            <Plus className="h-4 w-4" />
            {t("availabilityRuleAdd")}
          </Button>
        </div>
      )}

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
 * The draft minus one group. Matched on the group's identity — hours *and*
 * shape — rather than on object identity: `groupRules` rebuilds its rows, so
 * the group a card hands back is never the same object as the one in the
 * draft.
 *
 * Hours alone would be wrong now that `groupRules` can split one pair of
 * hours into two cards with different buffer/grid/capacity (see its own
 * grouping-decision comment): filtering only on `startMinute`/`endMinute`
 * would strip out *both* cards' rows the moment either one was edited,
 * silently deleting whichever card was not being replaced.
 */
function withoutGroup(
  rules: readonly WeeklyRuleDraft[],
  group: WeekRuleGroup | null,
): WeeklyRuleDraft[] {
  if (!group) return [...rules];
  return rules.filter(
    (r) =>
      !(
        r.startMinute === group.startMinute &&
        r.endMinute === group.endMinute &&
        r.bufferMinutes === group.bufferMinutes &&
        r.slotIntervalMinutes === group.slotIntervalMinutes &&
        r.capacity === group.capacity
      ),
  );
}
