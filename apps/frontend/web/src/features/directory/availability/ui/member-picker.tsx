import { useTranslation } from "react-i18next";
import { cn } from "@ntizo/frontend-ui";

/**
 * "Anyone", or one specific performer — only when a service actually has
 * more than one.
 *
 * `memberIds` cannot be shown as names: the public `availability.forService`
 * query never carries one (see `domain/types.ts`'s `distinctMemberIds` doc
 * comment for why), so each is offered as a stable position in the sorted
 * id list instead — "Professional 1", "Professional 2" — rather than
 * inventing a display name the platform has deliberately not published.
 */
export function MemberPicker({
  memberIds,
  selectedMemberId,
  onChange,
}: {
  memberIds: readonly string[];
  /** `undefined` is "anyone" — the same absence `availability.forService` itself reads that way. */
  selectedMemberId: string | undefined;
  onChange: (memberId: string | undefined) => void;
}) {
  const { t } = useTranslation("directory");

  // One performer means the question has one answer, and asking it is
  // noise — the same rule the provider-side screen already applies to its
  // own person picker (`isIndividualProvider`).
  if (memberIds.length <= 1) return null;

  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
        {t("availabilityMemberLabel")}
      </span>
      <div role="radiogroup" aria-label={t("availabilityMemberLabel")} className="flex flex-wrap gap-2">
        <PickerButton
          selected={selectedMemberId === undefined}
          onClick={() => onChange(undefined)}
        >
          {t("availabilityMemberAnyone")}
        </PickerButton>
        {memberIds.map((id, index) => (
          <PickerButton key={id} selected={selectedMemberId === id} onClick={() => onChange(id)}>
            {t("availabilityMemberOption", { number: index + 1 })}
          </PickerButton>
        ))}
      </div>
    </div>
  );
}

function PickerButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-sm transition-colors",
        selected
          ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] font-semibold text-[var(--color-primary)]"
          : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
      )}
    >
      {children}
    </button>
  );
}
