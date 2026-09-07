import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, CreditCard } from "lucide-react";
import { Badge } from "@ntizo/frontend-ui";
import { useSession } from "@ntizo/auth-client";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { EmptyCard } from "@/shared/components/empty-card";
import { textAction } from "@/shared/ui/text-action";
import {
  AppearancePreference,
  LanguagePreference,
} from "@/features/account/ui/language-preference";

/**
 * The heading every settings page opens with: the section's name in the
 * headline colour and one line on what the page is for.
 *
 * Deliberately not exported: `company-page.tsx` exports a different
 * component under this same name, and two importable `SectionHeading`s with
 * different signatures is a trap for whoever autocompletes the wrong one.
 */
function SectionHeading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="mb-6">
      <h1 className="type-h1 text-[var(--color-headline)]">{title}</h1>
      <p className="type-body mt-1 text-[var(--color-muted-foreground)]">{blurb}</p>
    </div>
  );
}

export function PaymentMethodsPage() {
  const { t } = useTranslation("account");
  return (
    <>
      <SectionHeading title={t("navPaymentMethods")} blurb={t("paymentsBlurb")} />
      <EmptyCard badge={CreditCard} title={t("paymentsEmptyTitle")} body={t("paymentsEmptyBody")} />
    </>
  );
}

/**
 * One fact about the account, on a hairline: what it is, what it says, and
 * beside it the badge or the action that goes with it.
 *
 * The rows used to sit in a bordered card, and the password in a second one
 * with a tinted key icon. Three facts do not need two boxes; they need three
 * lines that read the same way.
 */
function FactRow({
  label,
  value,
  aside,
}: {
  label: string;
  value: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--color-border)] py-4 first:border-t-0 first:pt-0">
      {/* `basis-full sm:basis-0` so the badge drops to its own line on a
          phone rather than crushing an e-mail address into two characters
          per line. flex-1 alone would let it shrink without ever wrapping. */}
      <div className="min-w-0 flex-1 basis-full sm:basis-0">
        <div className="type-body-medium font-semibold">{label}</div>
        {/* An address and a phone number are single words with nowhere to
            break, so they set the row's minimum width and push the page into
            a sideways scroll. `anywhere` lets them wrap mid-token. */}
        <div className="type-body [overflow-wrap:anywhere] text-[var(--color-muted-foreground)]">
          {value}
        </div>
      </div>
      {aside && <div className="flex items-center gap-3">{aside}</div>}
    </div>
  );
}

function Confirmed({ verified }: { verified: boolean }) {
  const { t } = useTranslation("account");
  return verified ? (
    <Badge tone="success" className="gap-1">
      <BadgeCheck className="h-3.5 w-3.5" />
      {t("confirmed")}
    </Badge>
  ) : (
    <Badge tone="warning">{t("unconfirmed")}</Badge>
  );
}

export function SecurityPage() {
  const { t } = useTranslation("account");
  const { data: user } = useCurrentUser();
  // Read from the session, not the read model, the same way the profile
  // reads it: whether a number is verified is an auth fact. This page used
  // to call any number "confirmed" merely for existing, and so contradicted
  // the profile beside it about the same digits.
  //
  // `isPending` matters as much as the value. The session starts as
  // `{ data: null, isPending: true }` and is fetched only after mount, so a
  // page that reads the value alone renders "not confirmed" through the
  // server render and the first client paint, then flips — telling a
  // verified reader they have something to do, briefly, on every visit.
  const { data: session, isPending: sessionPending } = useSession();
  const phoneVerified = Boolean(session?.user?.phoneNumberVerified);

  // Empty string, not just null: the read model types this nullable, and a
  // blank line beside a "verify" action would be a row about nothing.
  const phone = user?.phoneNumber || null;

  return (
    <>
      <SectionHeading title={t("navSecurity")} blurb={t("securityBlurb")} />
      <div>
        {/* Email is confirmed by definition: sign-in requires it. Showing the
            row anyway is what makes the phone row below it read as an
            outstanding task rather than an oddity. */}
        <FactRow label={t("fieldEmail")} value={user?.email || t("notSet")} aside={<Confirmed verified />} />
        <FactRow
          label={t("fieldPhone")}
          value={phone ?? t("notSet")}
          aside={
            !phone ? (
              // Not `/verify-phone`: that screen short-circuits to a dead end
              // ("no phone on this account", and a link home) when the session
              // carries no number. The place to add one is the profile form.
              <Link to="/account" className={textAction()}>
                {t("addPhone")}
              </Link>
            ) : sessionPending ? null : (
              <>
                <Confirmed verified={phoneVerified} />
                {/* The badge says there is something to do, so the row has to
                    carry the doing of it. Without this link the account area
                    had no route to the OTP screen at all. */}
                {!phoneVerified && (
                  <Link to="/verify-phone" className={textAction()}>
                    {t("verifyPhone")}
                  </Link>
                )}
              </>
            )
          }
        />
        {/* Goes through the same emailed link as a forgotten password rather
            than an in-page form. Changing a password from an already-open
            session proves nothing about who is at the keyboard; the email
            does. */}
        <FactRow
          label={t("passwordTitle")}
          value={t("passwordBlurb")}
          aside={
            <Link to="/forgot-password" className={textAction()}>
              {t("changePassword")}
            </Link>
          }
        />
      </div>
    </>
  );
}

/**
 * Preferences: the language and the appearance, one under the other.
 *
 * There is no notification section. Every notification is sent by email and
 * nothing is switchable, so four rows of disabled checkboxes with a note
 * saying they were not saved — which is what stood here until 2026-09-07 —
 * offered a choice that did not exist. A settings page that is mostly inert
 * controls reads as broken; when there is something to choose, the section
 * comes back with controls that work.
 */
export function PreferencesPage() {
  const { t } = useTranslation("account");

  return (
    <>
      <SectionHeading title={t("navPreferences")} blurb={t("preferencesBlurb")} />
      <div>
        <LanguagePreference />
        <AppearancePreference />
      </div>
    </>
  );
}

export function LegalPage() {
  const { t } = useTranslation("account");
  return (
    <>
      <SectionHeading title={t("navLegal")} blurb={t("legalBlurb")} />
      <ul className="grid list-none p-0">
        {["terms", "privacy", "cookies"].map((key) => (
          <li
            key={key}
            className="type-body-medium border-t border-[var(--color-border)] py-4 first:border-t-0 first:pt-0"
          >
            {t(`legal.${key}`)}
            <span className="type-caption ml-2 text-[var(--color-muted-foreground)]">
              {t("legalPending")}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
