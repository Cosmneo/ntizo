import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback } from "@ntizo/frontend-ui";
import { initialsFrom } from "@/shared/lib/initials";
import type { ServicePerformerDTO } from "@ntizo/shared/read-models";

/**
 * Who actually shows up to do the work — shown only when that is a real
 * question.
 *
 * Renders nothing for zero or one performer: one name answers "who will do
 * this" before it is asked, and a roster of one reads as padding rather than
 * information. `MemberPicker` applies the identical threshold to the
 * availability panel's own person picker, for the same reason.
 *
 * First name and photo only, never a surname — these are employees, not
 * account holders, publishing more than `ServicePerformerDTO` carries is not
 * available here. A performer with no photo falls back to a monogram rather
 * than a blank circle, matching every other avatar in the app.
 */
export function ServicePerformers({
  performers,
}: {
  performers: readonly ServicePerformerDTO[];
}) {
  const { t } = useTranslation("directory");

  if (performers.length <= 1) return null;

  return (
    <div className="mt-8">
      <h2 className="type-h3 font-semibold">{t("performersTitle")}</h2>
      <ul className="mt-3 flex list-none flex-wrap gap-4 p-0">
        {performers.map((performer) => (
          <li
            key={performer.id}
            className="flex w-20 flex-col items-center gap-1.5 text-center"
          >
            <Avatar className="h-14 w-14">
              {performer.avatarUrl && (
                <img
                  src={performer.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
              <AvatarFallback>{initialsFrom(performer.firstName)}</AvatarFallback>
            </Avatar>
            <span className="type-caption w-full truncate">{performer.firstName}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
