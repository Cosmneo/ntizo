import { useTranslation } from "react-i18next";
import { cn } from "@ntizo/frontend-ui";

/**
 * "Anyone", or one specific performer — only when a service actually has
 * more than one.
 *
 * Until 2026-08-13 this comment said `memberIds` could not be shown as
 * names, because the platform had deliberately not published them. That was
 * a real, considered choice, and it was reversed on 2026-08-13: `serviceById`
 * now publishes each performer's first name and photo
 * (`ServiceDetailDTO.performers`), so this picker takes an optional
 * `performers` list and labels a matching id with its real first name
 * instead of a position.
 *
 * The public `availability.forService` query itself still never carries a
 * name — see `domain/types.ts`'s `distinctMemberIds` doc comment — which is
 * exactly why the numbered fallback survives rather than being deleted: a
 * caller with no `performers` to hand, or one whose list doesn't cover a
 * given id, still needs a label for every id that query returns. It also
 * survives *with* `performers` supplied: `firstName` carries a `.default("")`
 * in its schema, so a member whose profile has no first name resolves to an
 * empty string, and this component treats that exactly like "no match"
 * rather than rendering a blank button — "Professional 1", "Professional 2",
 * a stable position in the sorted id list.
 */
export function MemberPicker({
  memberIds,
  selectedMemberId,
  onChange,
  performers,
}: {
  memberIds: readonly string[];
  /** `undefined` is "anyone" — the same absence `availability.forService` itself reads that way. */
  selectedMemberId: string | undefined;
  onChange: (memberId: string | undefined) => void;
  /** First names to label the roster with, keyed by matching `id`. Optional, and blank names inside it fall back same as no match at all. */
  performers?: readonly { id: string; firstName: string }[];
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
        {memberIds.map((id, index) => {
          // A blank `firstName` (the schema's own `.default("")`) is treated
          // as no match at all, not as a name to render — see the doc
          // comment above.
          const firstName = performers?.find((p) => p.id === id)?.firstName;
          return (
            <PickerButton key={id} selected={selectedMemberId === id} onClick={() => onChange(id)}>
              {firstName ? firstName : t("availabilityMemberOption", { number: index + 1 })}
            </PickerButton>
          );
        })}
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
