import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Pencil, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@ntizo/frontend-ui";
import { useSession } from "@ntizo/auth-client";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useMyProviders } from "@/features/provider/viewmodel/use-providers";
import { canAccessProvider } from "@/shared/lib/zones";
import { textAction } from "@/shared/ui/text-action";
import { ProfileForm } from "@/features/account/ui/profile-form";

function initialsOf(source: string): string {
  return source
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * One personal detail: a small label with its value directly under it.
 *
 * Label above value, not label-left value-right. The old layout put the two in
 * opposite corners of a wide column, so reading "date of birth" meant crossing
 * empty space to find the date. No icon disc beside it any more: three labels
 * in a row are their own signposts, and the discs were the tinted squares the
 * rest of the area is losing.
 */
function Detail({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation("account");
  return (
    <div className="min-w-0">
      <dt className="type-caption text-[var(--color-muted-foreground)]">{label}</dt>
      <dd
        className={
          value
            ? "type-body mt-0.5 font-medium"
            : "type-body mt-0.5 text-[var(--color-muted-foreground)]"
        }
      >
        {value || t("notSet")}
      </dd>
    </div>
  );
}

/**
 * The profile: who this is, how to reach them, and the few facts they chose
 * to tell us. No card, no tiles.
 *
 * Two things left on 2026-09-07. The three figures under the details —
 * bookings completed, average rating given, customer since — were a zero, a
 * dash and a date for nearly everyone; the date is the only one that means
 * something to a customer, so it is a sentence under the name now. And the
 * language, which Preferences already sets, no longer appears here as a fact:
 * one place to read it, one place to change it.
 */
export function AccountPage() {
  const { t, i18n } = useTranslation("account");
  const { data: user } = useCurrentUser();
  // `isPending` as well as the value: the session is fetched only after
  // mount, so reading the value alone paints "not verified" beside a
  // verified number on every first render. See `SecurityPage`.
  const { data: session, isPending: sessionPending } = useSession();
  const { data: providers = [] } = useMyProviders();
  const [editing, setEditing] = useState(false);

  if (!user) return null;

  const locale = i18n.resolvedLanguage ?? i18n.language;
  const name = user.displayName || user.name || user.email;
  const isProvider = canAccessProvider(user, providers.length);

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });

  return (
    <>
      <section>
        <div className="flex flex-wrap items-start gap-x-5 gap-y-4">
          <Avatar className="h-[72px] w-[72px]">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={name} /> : null}
            <AvatarFallback className="type-h2 bg-[var(--color-navy-surface)] font-semibold text-[var(--color-navy-on)]">
              {initialsOf(name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <h1 className="type-h1 text-[var(--color-headline)]">{name}</h1>
            <p className="type-body mt-1 [overflow-wrap:anywhere] text-[var(--color-muted-foreground)]">
              {user.phoneNumber ? (
                <>
                  {user.phoneNumber}
                  {/* Read from the session, not the read model: whether a
                      number is verified is an auth fact, and copying it into
                      the domain profile would create a second truth that
                      drifts. It reads "not verified" for nearly everyone
                      until an SMS provider exists — which is accurate, and
                      why it sits beside the number rather than standing as a
                      verdict on the whole account. */}
                  {sessionPending || session?.user?.phoneNumberVerified ? null : (
                    <span className="ml-1.5 text-[var(--color-warning)]">· {t("phoneUnverified")}</span>
                  )}
                  {" · "}
                </>
              ) : null}
              {user.email}
            </p>
            <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">
              {t("statMemberSince")} {monthFmt.format(new Date(user.createdAt))}
            </p>
          </div>

          {/* basis-full below `sm`: beside the avatar and the name there is
              no room for a third thing on a phone, and sharing the row
              squeezed the name into two lines. Its own line under the
              header is where it fits. */}
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`${textAction()} basis-full sm:basis-auto sm:mt-2`}
            >
              <Pencil className="h-[15px] w-[15px]" />
              {t("editProfile")}
            </button>
          )}
        </div>

        {editing ? (
          <ProfileForm user={user} onDone={() => setEditing(false)} />
        ) : (
          <dl className="mt-8 grid gap-6 border-t border-[var(--color-border)] pt-6 sm:grid-cols-3">
            <Detail
              label={t("fieldDateOfBirth")}
              value={user.dateOfBirth ? dateFmt.format(new Date(user.dateOfBirth)) : null}
            />
            <Detail label={t("fieldGender")} value={user.gender ? t(`gender.${user.gender}`) : null} />
            <Detail label={t("fieldTimezone")} value={user.timezone} />
          </dl>
        )}
      </section>

      {/* Only for someone who is not one yet. A provider who already has a
          workspace does not need to be invited into it. Navy, the one filled
          surface on the page, because it is the one thing here that asks
          for a decision. */}
      {!isProvider ? (
        <Link
          to="/become-provider"
          className="mt-10 flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] bg-[var(--color-navy-surface)] p-5 text-[var(--color-navy-on)]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1 basis-[calc(100%-3.75rem)] sm:basis-0">
            <span className="type-h3 block font-semibold">{t("becomeProviderTitle")}</span>
            <span className="type-body block opacity-85">{t("becomeProviderBody")}</span>
          </span>
          {/* Its own line on a phone, inline from `sm`. Sharing the row, it
              left the pitch three words wide — the sentence that is supposed
              to do the persuading. */}
          <span className="type-button basis-full rounded-full bg-white px-5 py-3 text-center text-[var(--color-navy-surface)] sm:basis-auto">
            {t("becomeProviderCta")}
          </span>
        </Link>
      ) : null}
    </>
  );
}
