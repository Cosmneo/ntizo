import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MessageSquare, ShieldCheck } from "lucide-react";
import { Button, OtpInput } from "@ntizo/frontend-ui";
import { authClient, useSession } from "@/shared/lib/api/auth-client";
import { AuthLayout } from "@/features/auth/components/auth-layout";

/** Matches `expiresIn: 300` on the server plugin; a resend before then is wasted spend. */
const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyPhone() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const { data: session } = useSession();

  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const user = session?.user as
    | { phoneNumber?: string | null; phoneNumberVerified?: boolean | null }
    | undefined;
  const phoneNumber = user?.phoneNumber ?? "";

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function send() {
    if (!phoneNumber || busy || cooldown > 0) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.phoneNumber.sendOtp({ phoneNumber });
      if (err) {
        setError(err.message ?? t("otpSendFailed"));
        return;
      }
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError(t("otpSendFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.phoneNumber.verify({
        phoneNumber,
        code: value,
      });
      if (err) {
        // Clear the boxes: leaving a rejected code in place invites the user
        // to press submit again on the exact input that just failed.
        setCode("");
        setError(err.message ?? t("otpInvalid"));
        return;
      }
      navigate({ to: "/" });
    } catch {
      setCode("");
      setError(t("otpInvalid"));
    } finally {
      setBusy(false);
    }
  }

  // Already done — nothing to verify, and re-sending would just burn an SMS.
  if (user?.phoneNumberVerified) {
    return (
      <AuthLayout
        title={t("phoneAlreadyVerifiedTitle")}
        subtitle={t("phoneAlreadyVerifiedSubtitle")}
        icon={<ShieldCheck className="h-6 w-6 text-[var(--color-primary)]" />}
        footer={
          <Link to="/" className="text-[var(--color-accent)] hover:underline">
            {t("backToHome")}
          </Link>
        }
      >
        <span />
      </AuthLayout>
    );
  }

  if (!phoneNumber) {
    return (
      <AuthLayout
        title={t("verifyPhoneTitle")}
        subtitle={t("noPhoneOnAccount")}
        icon={<MessageSquare className="h-6 w-6 text-[var(--color-primary)]" />}
        footer={
          <Link to="/" className="text-[var(--color-accent)] hover:underline">
            {t("backToHome")}
          </Link>
        }
      >
        <span />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("verifyPhoneTitle")}
      subtitle={sent ? t("otpSentTo", { phone: phoneNumber }) : t("verifyPhoneSubtitle", { phone: phoneNumber })}
      icon={<MessageSquare className="h-6 w-6 text-[var(--color-primary)]" />}
      footer={
        <Link to="/" className="text-[var(--color-accent)] hover:underline">
          {t("backToHome")}
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p className="text-center text-sm text-[var(--color-destructive)]">{error}</p>
        ) : null}

        {sent ? (
          <>
            <OtpInput
              value={code}
              onChange={setCode}
              onComplete={verify}
              disabled={busy}
              autoFocus
              digitLabel={(position, total) => t("otpDigitLabel", { position, total })}
            />
            <Button
              type="button"
              className="w-full"
              disabled={busy || code.length < 6}
              onClick={() => verify(code)}
            >
              {busy ? t("verifying") : t("verifyCode")}
            </Button>
            <button
              type="button"
              onClick={send}
              disabled={cooldown > 0 || busy}
              className="text-sm text-[var(--color-accent)] hover:underline disabled:cursor-not-allowed disabled:text-[var(--color-muted-foreground)] disabled:no-underline"
            >
              {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resendCode")}
            </button>
          </>
        ) : (
          <Button type="button" className="w-full" disabled={busy} onClick={send}>
            {busy ? t("sending") : t("sendCode")}
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
