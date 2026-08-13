import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { Field } from "@/shared/components/wizard/wizard-chrome";
import type { AvailabilityMember } from "@/features/provider/availability/domain/types";
import type { ServiceDraft } from "../../domain/service-draft";

/**
 * Step 3: who performs this service.
 *
 * Cards, not a checkbox list. A row of small boxes beside names reads as a
 * settings form — a list of things being configured — where this is one of
 * the wizard's questions and deserves the same weight as the others it sits
 * between. The onboarding wizard makes the same trade on its provider-type
 * screen, and for the same reason: an answer that changes what the service is
 * should be read rather than ticked in passing.
 *
 * Still `role="checkbox"` on each card, not a plain button. The control is a
 * set of independent yes/no answers, which is what a checkbox is; only its
 * appearance changed, and a screen reader should hear no difference.
 *
 * Absent from the wizard entirely for an individual provider — that decision
 * lives in `../../domain/wizard-model.ts`'s `stepsFor`, which omits the step
 * rather than showing a permanently-answered one. This component assumes it
 * is only ever rendered for an organization and does not re-check.
 */
export function StepPerformers({
  draft,
  setDraft,
  members,
  error,
  onErrorClear,
}: {
  draft: ServiceDraft;
  setDraft: Dispatch<SetStateAction<ServiceDraft>>;
  members: readonly AvailabilityMember[];
  error?: string | undefined;
  onErrorClear: () => void;
}) {
  const { t } = useTranslation("provider");

  function toggle(memberId: string, next: boolean) {
    onErrorClear();
    setDraft((d) => ({
      ...d,
      memberIds: next
        ? [...d.memberIds, memberId]
        : d.memberIds.filter((id) => id !== memberId),
    }));
  }

  return (
    <Field
      label={t("serviceMembersQuestion")}
      {...(error ? { error } : { hint: t("serviceMembersHint") })}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((member) => {
          const selected = draft.memberIds.includes(member.memberId);
          const name = member.name ?? member.userId;
          return (
            <button
              key={member.memberId}
              type="button"
              role="checkbox"
              aria-checked={selected}
              // The person is what this answers for; their role is supporting
              // detail on the card, not part of what the control is called.
              aria-label={name}
              onClick={() => toggle(member.memberId, !selected)}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-card)] border p-4 text-left transition-colors",
                selected
                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold",
                  selected
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
                )}
              >
                {selected ? <Check className="h-4 w-4" /> : initials(name)}
              </span>
              <span className="min-w-0">
                <span className="type-body-medium block truncate font-semibold">{name}</span>
                <span className="type-caption block truncate text-[var(--color-muted-foreground)]">
                  {t(`peopleRoles.${member.role}`, { defaultValue: member.role })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/** Up to two initials, so a card has something of its own before it is chosen. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
