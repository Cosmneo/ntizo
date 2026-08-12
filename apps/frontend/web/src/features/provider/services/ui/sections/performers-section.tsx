import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@ntizo/frontend-ui";
import type { AvailabilityMember } from "@/features/provider/availability/domain/types";
import type { ServiceDraft } from "../../domain/service-draft";

/**
 * Section 3: who performs this service.
 *
 * Absent from the rail entirely for an individual provider — that decision
 * lives in `../../domain/completeness.ts`'s `sectionStates` (it omits the
 * `performers` entry outright rather than including a permanently-complete
 * one) and in `service-editor-page.tsx` (which never selects this section
 * for one). This component itself assumes it is only ever rendered for an
 * organization and does not re-check.
 *
 * The checkbox list, not `ChoiceChipsMulti`: the design's chip list
 * (category, location, booking mode, slot interval, languages, provider
 * type, weekdays) does not include performers, so this stays the plain
 * checkbox list `service-form.tsx` already used.
 */
export function PerformersSection({
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

  return (
    <Field
      label={t("serviceMembersQuestion")}
      hint={error ? undefined : t("serviceMembersHint")}
      error={error}
    >
      <div className="grid gap-2">
        {members.map((member) => (
          <label key={member.memberId} className="flex items-center gap-2.5">
            <Checkbox
              checked={draft.memberIds.includes(member.memberId)}
              onChange={(e) => {
                onErrorClear();
                setDraft((d) => ({
                  ...d,
                  memberIds: e.target.checked
                    ? [...d.memberIds, member.memberId]
                    : d.memberIds.filter((id) => id !== member.memberId),
                }));
              }}
            />
            <span className="type-body">{member.name ?? member.userId}</span>
          </label>
        ))}
      </div>
    </Field>
  );
}

/** The same small label-above-field wrapper every section in this editor uses. */
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
        {label}
      </span>
      {children}
      {error ? (
        <span className="type-caption text-[var(--color-destructive)]">{error}</span>
      ) : (
        hint && (
          <span className="type-caption text-[var(--color-muted-foreground)]">{hint}</span>
        )
      )}
    </div>
  );
}
