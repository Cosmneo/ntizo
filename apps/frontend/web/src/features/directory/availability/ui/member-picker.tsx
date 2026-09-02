import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Check, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage, cn } from "@ntizo/frontend-ui";
import { initialsFrom } from "@/shared/lib/initials";
import { memberDayFree } from "@/features/directory/availability/domain/day-strip";
import type { Start } from "@/features/directory/availability/domain/types";

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
 *
 * **A vertical list, not a row of pills.** It was chosen over five other
 * shapes for one reason: it is the only one that survives a salon with twelve
 * staff without wrapping into three rows or scrolling sideways, and on a
 * phone each row is a target the width of the panel rather than the width of
 * a name. A row carries a face, a name, and how much of the day that person
 * still has free — which is the fact that decides the choice, and which a
 * pill had nowhere to put.
 *
 * **The sub-lines are a sum over `days[].starts[].memberIds`** — who is free
 * at each moment — and cost no extra query. A count of moments is not a seat
 * index: how many openings a day holds is a fact a customer is being invited
 * to act on, where which seat they would occupy is not, and nothing here
 * publishes the second.
 *
 * **Hand it the whole roster's day, never one narrowed to the chosen
 * performer.** These rows speak for the people the customer has *not* picked
 * as much as for the one they have; fed a narrowed day they report zero for
 * everybody else, which is a list of twelve saying eleven things that are not
 * true. See `daysFor`.
 */
export function MemberPicker({
  memberIds,
  selectedMemberId,
  onChange,
  performers,
  starts,
  locale,
  timezone,
}: {
  memberIds: readonly string[];
  /** `undefined` is "anyone" — the same absence `availability.forService` itself reads that way. */
  selectedMemberId: string | undefined;
  onChange: (memberId: string | undefined) => void;
  /** First names and photos to label the roster with, keyed by matching `id`. Optional, and blank names inside it fall back same as no match at all. */
  performers?: readonly { id: string; firstName: string; avatarUrl: string | null }[];
  /** The starts of the day currently on screen — what every sub-line counts. */
  starts: readonly Start[];
  locale: string;
  /** The **service's** zone, never the device's — see `formatTime`. */
  timezone: string;
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
      {/* One border around the whole list and hairlines between the rows,
          rather than a border per row: twelve bordered cards stacked read as
          twelve separate decisions, where one framed list reads as one. */}
      <div
        role="radiogroup"
        aria-label={t("availabilityMemberLabel")}
        className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]"
      >
        <MemberRow
          selected={selectedMemberId === undefined}
          onClick={() => onChange(undefined)}
          name={t("availabilityMemberAnyone")}
          detail={freeLine(t, locale, timezone, starts, undefined)}
          face={
            // Stacked heads rather than a face or a monogram: this row is not
            // a person, and a `?` circle in the same place as eleven real
            // photographs reads as a performer whose picture failed to load.
            <Avatar className="h-9 w-9">
              <AvatarFallback>
                <Users className="h-4 w-4" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
          }
        />
        {memberIds.map((id, index) => {
          // A blank `firstName` (the schema's own `.default("")`) is treated
          // as no match at all, not as a name to render — see the doc
          // comment above.
          const performer = performers?.find((p) => p.id === id);
          const name = performer?.firstName
            ? performer.firstName
            : t("availabilityMemberOption", { number: index + 1 });
          return (
            <MemberRow
              key={id}
              selected={selectedMemberId === id}
              onClick={() => onChange(id)}
              name={name}
              detail={freeLine(t, locale, timezone, starts, id)}
              face={
                <Avatar className="h-9 w-9">
                  {/* `AvatarImage` rather than a bare `<img>`: with both
                      children mounted a 404'd photo pushes the fallback out
                      of the clipped circle, so the monogram never appears —
                      see that component's own doc comment. */}
                  {performer?.avatarUrl && <AvatarImage src={performer.avatarUrl} alt="" />}
                  <AvatarFallback>{initialsFrom(name)}</AvatarFallback>
                </Avatar>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * A start time in the **service's** own zone, never the reader's device.
 *
 * A Maputo service read on a device clocked to UTC has already cost this flow
 * one empty grid under a live confirm button; "a próxima às 12:30" printed
 * two hours out is the same substitution wearing different clothes, and it is
 * harder to notice because the sentence still looks right.
 */
function formatTime(startsAt: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(startsAt),
  );
}

/**
 * The muted second line of a row: how much of the shown day this person still
 * has free, and when the next of it is.
 *
 * **It borrows the day card's own word for the same number** — "6 livres",
 * matching `availabilityDayFree`'s "17 livres" on the strip above. It said
 * "6 horas" first, and that was a different unit dressed as the same one: the
 * number is bookable *starts*, so six of them on a thirty-minute service is
 * three hours and on a ninety-minute one is nine. Two numbers on one screen
 * that a customer cannot add up are worse than one.
 *
 * **A person with nothing free that day says so and stays selectable.** They
 * are not dropped from the list and they are not `disabled`: a customer may
 * well pick them precisely to go looking at another day, and a roster that
 * changed length as the week was browsed would make the list a moving target.
 * That line names no day — "sem horários", not "sem horas hoje", which was
 * false on every day but one and read as a claim about today to somebody
 * looking at next Tuesday. The selected date is on the card directly above
 * the list, so repeating it in twelve rows would cost the space the row
 * hasn't got to say something already on screen.
 * `disabled` is separately out of the question — the day cards already
 * learned that a disabled button is pulled out of the tab order, so the very
 * label explaining why it cannot be used is the one thing that can never be
 * announced.
 */
function freeLine(
  t: TFunction,
  locale: string,
  timezone: string,
  starts: readonly Start[],
  memberId: string | undefined,
): string {
  const { count, nextStartsAt } = memberDayFree(starts, memberId);
  if (count === 0 || nextStartsAt === null) return t("availabilityMemberNone");
  return t("availabilityMemberFree", {
    count,
    time: formatTime(nextStartsAt, locale, timezone),
  });
}

function MemberRow({
  selected,
  onClick,
  name,
  detail,
  face,
}: {
  selected: boolean;
  onClick: () => void;
  name: string;
  detail: string;
  face: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      // The two visible lines, joined. A button with an `aria-label` is
      // announced by that label alone, so a row labelled with the name only
      // would hide the half of it that decides the choice — including "sem
      // horas hoje", which is the whole reason that row is still here.
      aria-label={`${name}, ${detail}`}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
        selected
          ? "bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
          : "hover:bg-[var(--color-muted)]",
      )}
    >
      {face}
      <span aria-hidden="true" className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm",
            selected ? "font-semibold text-[var(--color-primary)]" : "font-medium",
          )}
        >
          {name}
        </span>
        <span className="type-caption block truncate text-[var(--color-muted-foreground)]">
          {detail}
        </span>
      </span>
      {/* The ring is drawn on every row so the tick has somewhere to appear
          without the row reflowing when it does. */}
      <span
        aria-hidden="true"
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
          selected
            ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
            : "border-[var(--color-border)]",
        )}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}
