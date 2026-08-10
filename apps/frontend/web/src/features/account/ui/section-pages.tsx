import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, CreditCard, KeyRound, ShieldAlert } from "lucide-react";
import { Badge, Button } from "@ntizo/frontend-ui";
import {
  NotificationBucket,
  OPTIONAL_NOTIFICATION_CHANNELS,
  isMeteredChannel,
} from "@ntizo/shared";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { EmptyState } from "@/features/account/ui/empty-state";
import {
  AppearancePreference,
  LanguagePreference,
} from "@/features/account/ui/language-preference";
import { Setting } from "@/features/account/ui/setting";

function SectionHeading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mb-5">
      <h1 className="type-h1">{title}</h1>
      <p className="type-body mt-1 text-[var(--color-muted-foreground)]">{blurb}</p>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] p-6">
      {children}
    </div>
  );
}

export function PaymentMethodsPage() {
  const { t } = useTranslation("account");
  return (
    <>
      <SectionHeading title={t("navPaymentMethods")} blurb={t("paymentsBlurb")} />
      <EmptyState
        icon={<CreditCard className="h-6 w-6" />}
        title={t("paymentsEmptyTitle")}
        body={t("paymentsEmptyBody")}
      />
    </>
  );
}

/** One confirmed-or-not row, for email and phone. */
function VerificationRow({
  label,
  value,
  verified,
  action,
}: {
  label: string;
  value: string | null;
  verified: boolean;
  action?: React.ReactNode;
}) {
  const { t } = useTranslation("account");
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] py-4 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="type-body-medium font-semibold">{label}</div>
        <div className="type-body text-[var(--color-muted-foreground)]">
          {value || t("notSet")}
        </div>
      </div>
      {verified ? (
        <Badge tone="success" className="gap-1">
          <BadgeCheck className="h-3.5 w-3.5" />
          {t("confirmed")}
        </Badge>
      ) : (
        <Badge tone="warning">{t("unconfirmed")}</Badge>
      )}
      {action}
    </div>
  );
}

export function SecurityPage() {
  const { t } = useTranslation("account");
  const { data: user } = useCurrentUser();

  return (
    <>
      <SectionHeading title={t("navSecurity")} blurb={t("securityBlurb")} />
      <Panel>
        {/* Email is confirmed by definition: sign-in requires it. Showing the
            row anyway is what makes the phone row below it read as an
            outstanding task rather than an oddity. */}
        <VerificationRow label={t("fieldEmail")} value={user?.email ?? null} verified />
        <VerificationRow
          label={t("fieldPhone")}
          value={user?.phoneNumber ?? null}
          verified={Boolean(user?.phoneNumber)}
          action={
            !user?.phoneNumber ? (
              <Link to="/verify-phone">
                <Button variant="secondary" size="sm">
                  {t("verifyPhone")}
                </Button>
              </Link>
            ) : undefined
          }
        />
      </Panel>

      <div className="mt-4">
        <Panel>
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-card-sm)] bg-[var(--color-muted)]">
              <KeyRound className="h-5 w-5 text-[var(--color-primary)]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="type-body-medium font-semibold">{t("passwordTitle")}</div>
              <div className="type-body text-[var(--color-muted-foreground)]">
                {t("passwordBlurb")}
              </div>
            </div>
            {/* Goes through the same emailed link as a forgotten password
                rather than an in-page form. Changing a password from an
                already-open session proves nothing about who is at the
                keyboard; the email does. */}
            <Link to="/forgot-password">
              <Button variant="outline">{t("changePassword")}</Button>
            </Link>
          </div>
        </Panel>
      </div>
    </>
  );
}

/**
 * Preferences: language, appearance and notifications, one under the other.
 *
 * They were three places — two sidebar entries and a submenu in the account
 * dropdown. All three answer the same question, how the app should behave for
 * this person, and splitting that across a sidebar turns navigation into a
 * table of contents.
 */
export function PreferencesPage() {
  const { t } = useTranslation("account");

  return (
    <>
      <SectionHeading title={t("navPreferences")} blurb={t("preferencesBlurb")} />
      <Panel>
        <LanguagePreference />
        <AppearancePreference />
        <NotificationSettings />
      </Panel>
    </>
  );
}

function NotificationSettings() {
  const { t } = useTranslation("account");
  const buckets = Object.values(NotificationBucket);

  return (
    <Setting title={t("navNotifications")} blurb={t("notificationsBlurb")}>
      <>
        {/* Only the switchable buckets appear. Confirmations, refunds and
            sign-in alerts are transactional — they are sent regardless, and
            offering a switch that does nothing would be a lie. The list comes
            from the enum, so a notification type added later shows up here
            once someone assigns it a bucket. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr>
                <th className="type-caption pb-3 text-left font-medium text-[var(--color-muted-foreground)]">
                  {t("notifyWhat")}
                </th>
                {OPTIONAL_NOTIFICATION_CHANNELS.map((channel) => (
                  <th
                    key={channel}
                    className="type-caption pb-3 text-center font-medium text-[var(--color-muted-foreground)]"
                  >
                    {t(`channel.${channel}`)}
                    {isMeteredChannel(channel) ? (
                      <span className="block text-[10px] opacity-70">{t("channelCosts")}</span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => (
                <tr key={bucket} className="border-t border-[var(--color-border)]">
                  <td className="type-body-medium py-3.5">{t(`bucket.${bucket}`)}</td>
                  {OPTIONAL_NOTIFICATION_CHANNELS.map((channel) => (
                    <td key={channel} className="py-3.5 text-center">
                      <input
                        type="checkbox"
                        defaultChecked
                        disabled
                        aria-label={`${t(`bucket.${bucket}`)} — ${t(`channel.${channel}`)}`}
                        className="h-4 w-4 accent-[var(--color-primary)]"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Disabled, and said out loud. There is nowhere to store a
            preference yet and nothing that sends a notification, so a switch
            that appeared to work would be the worst of the three states. */}
        <p className="type-caption mt-4 flex items-start gap-2 rounded-[var(--radius-field)] bg-[var(--color-muted)] p-3 text-[var(--color-muted-foreground)]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {t("notificationsPending")}
        </p>
      </>
    </Setting>
  );
}

export function LegalPage() {
  const { t } = useTranslation("account");
  return (
    <>
      <SectionHeading title={t("navLegal")} blurb={t("legalBlurb")} />
      <Panel>
        <ul className="grid list-none gap-3 p-0">
          {["terms", "privacy", "cookies"].map((key) => (
            <li key={key} className="type-body-medium">
              {t(`legal.${key}`)}
              <span className="type-caption ml-2 text-[var(--color-muted-foreground)]">
                {t("legalPending")}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
