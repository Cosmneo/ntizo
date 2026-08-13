import { useTranslation } from "react-i18next";

/**
 * The right column's answer for a `priced` service that has arrived with no
 * active packages left — `serviceDetailPanel`'s `unavailable` kind
 * (`domain/service-card.ts`; read that doc comment for how this state is
 * reachable at all).
 *
 * Not `ServiceQuoteNotice` reused, and not allowed to read like it: a `quote`
 * service has never had a price, so "contact the provider to get one" is true
 * advice for it. This service has a fixed price — only its packages are
 * (probably temporarily) gone — so the same button here would tell the reader
 * to go ask for a price that already exists. That is wrong advice, not a
 * mislabelled button, which is why this notice offers no action at all rather
 * than reusing `packageContactProvider`. The same restraint `PackageChooser`
 * itself applies by rendering nothing sooner than inventing a total.
 */
export function ServicePackagesUnavailable() {
  const { t } = useTranslation("directory");

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
      <p className="type-body text-[var(--color-muted-foreground)]">
        {t("packagesUnavailableNotice")}
      </p>
    </div>
  );
}
