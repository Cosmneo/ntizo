import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";

function Row({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation("account");
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-border)] py-3 last:border-0">
      <dt className="text-sm text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className={value ? "text-sm" : "text-sm text-[var(--color-muted-foreground)] italic"}>
        {value || t("notSet")}
      </dd>
    </div>
  );
}

/**
 * The customer's own details. Read-only for now — editing needs a mutation
 * that does not exist yet, and a form that saves nothing is worse than none.
 */
export function AccountPage() {
  const { t } = useTranslation("account");
  const { data: user } = useCurrentUser();

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("accountTitle")}</h1>
      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
        {t("accountSubtitle")}
      </p>

      <dl className="mt-8 rounded-lg border border-[var(--color-border)] px-5">
        <Row label={t("fieldName")} value={user?.name ?? null} />
        <Row label={t("fieldEmail")} value={user?.email ?? null} />
        {/* Reads the Profile's phone, which the signup path does not write —
            the number lives on the auth user instead. Shown rather than
            hidden so the gap is visible; see follow-ups.md entry 14. */}
        <Row label={t("fieldPhone")} value={user?.phoneNumber ?? null} />
      </dl>

      <p className="mt-6 text-sm text-[var(--color-muted-foreground)]">
        {t("verifyPhonePrompt")}{" "}
        <Link to="/verify-phone" className="text-[var(--color-accent)] hover:underline">
          {t("verifyPhoneLink")}
        </Link>
      </p>
    </>
  );
}
