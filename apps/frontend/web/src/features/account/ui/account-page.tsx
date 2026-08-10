import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Cake, Clock, Languages, Pencil, Sparkles, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback, Badge, Button } from "@ntizo/frontend-ui";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useMyProviders } from "@/features/provider/viewmodel/use-providers";
import { canAccessProvider } from "@/shared/lib/zones";
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
 * empty space to find the date — and with two of these per row, the eye could
 * not tell which value belonged to which label without checking twice.
 */
function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
}) {
  const { t } = useTranslation("account");
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-card-sm)] bg-[var(--color-muted)]">
        <Icon className="h-4 w-4 text-[var(--color-muted-foreground)]" />
      </span>
      <div className="min-w-0">
        <dt className="type-caption text-[var(--color-muted-foreground)]">{label}</dt>
        <dd
          className={
            value
              ? "type-body-medium mt-0.5 font-semibold"
              : "type-body-medium mt-0.5 text-[var(--color-muted-foreground)]"
          }
        >
          {value || t("notSet")}
        </dd>
      </div>
    </div>
  );
}

/**
 * One of the three figures under the details.
 *
 * On its own tinted panel rather than floating on the card. Three numbers in a
 * row with nothing around them read as a header for the section below; the
 * panel says they are the content.
 */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] px-4 py-3.5 text-center">
      <div className="type-h2 tabular-nums">{value}</div>
      <div className="type-caption mt-1 text-[var(--color-muted-foreground)]">{label}</div>
    </div>
  );
}

export function AccountPage() {
  const { t, i18n } = useTranslation("account");
  const { data: user } = useCurrentUser();
  const { data: providers = [] } = useMyProviders();
  const [editing, setEditing] = useState(false);

  if (!user) return null;

  const locale = i18n.resolvedLanguage ?? i18n.language;
  const name = user.displayName || user.name || user.email;
  const isProvider = canAccessProvider(user, providers.length);

  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });

  // Verified means email and phone, the two signals that exist. Identity
  // documents are a provider's obligation and live with their workspace, so
  // this badge deliberately does not claim them.
  const verified = Boolean(user.phoneNumber);

  return (
    <>
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-6">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar className="h-[72px] w-[72px]">
            <AvatarFallback className="type-h2 bg-[var(--color-primary)] font-semibold text-white">
              {initialsOf(name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="type-h1">{name}</h1>
              {verified ? (
                <Badge tone="success" className="gap-1">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {t("verified")}
                </Badge>
              ) : (
                <Badge tone="warning">{t("unverified")}</Badge>
              )}
            </div>
            <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
              {[user.phoneNumber, user.email].filter(Boolean).join(" · ")}
            </p>
          </div>

          {!editing ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              {t("editProfile")}
            </Button>
          ) : null}
        </div>

        {editing ? (
          <ProfileForm user={user} onDone={() => setEditing(false)} />
        ) : (
          <>
            <dl className="mt-6 grid gap-5 border-t border-[var(--color-border)] pt-6 sm:grid-cols-2 lg:grid-cols-4">
              <Detail
                icon={Cake}
                label={t("fieldDateOfBirth")}
                value={user.dateOfBirth ? dateFmt.format(new Date(user.dateOfBirth)) : null}
              />
              <Detail
                icon={UserRound}
                label={t("fieldGender")}
                value={user.gender ? t(`gender.${user.gender}`) : null}
              />
              <Detail
                icon={Languages}
                label={t("fieldLanguages")}
                value={t(`language.${user.language}`, { defaultValue: user.language })}
              />
              <Detail icon={Clock} label={t("fieldTimezone")} value={user.timezone} />
            </dl>

            {/* Two of these three have nowhere to come from yet. They are
                shown at zero rather than hidden: a customer with no bookings
                is the normal state at launch, and an empty row says that
                more honestly than an absent one. */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat value="0" label={t("statBookings")} />
              <Stat value="—" label={t("statRating")} />
              <Stat
                value={monthFmt.format(new Date(user.createdAt))}
                label={t("statMemberSince")}
              />
            </div>
          </>
        )}
      </section>

      {/* Only for someone who is not one yet. A provider who already has a
          workspace does not need to be invited into it. */}
      {!isProvider ? (
        <Link
          to="/provider"
          className="mt-4 flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] bg-[var(--color-primary)] p-5 text-white"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-card-sm)] bg-white/20">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="type-h3 block font-semibold">{t("becomeProviderTitle")}</span>
            <span className="type-body block text-white/85">{t("becomeProviderBody")}</span>
          </span>
          <span className="type-button rounded-[var(--radius-card-sm)] bg-white px-5 py-3 text-[var(--color-primary)]">
            {t("becomeProviderCta")}
          </span>
        </Link>
      ) : null}
    </>
  );
}
