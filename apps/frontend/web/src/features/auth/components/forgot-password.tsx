import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { KeyRound, Lock, MailCheck } from "lucide-react";
import { Button, Input, Label } from "@ntizo/frontend-ui";
import { authClient } from "@/shared/lib/api/auth-client";
import { AuthLayout } from "@/features/auth/components/auth-layout";

export function ForgotPassword() {
  const { t } = useTranslation("auth");
  const [sent, setSent] = useState(false);

  const form = useForm({
    defaultValues: { email: "" },
    validators: {
      onSubmitAsync: async ({ value }) => {
        try {
          // The route is `request-password-reset` on better-auth 1.6.2 —
          // `forget-password` is the older name and 404s here. Verified
          // against the running server, not taken from the docs.
          await authClient.requestPasswordReset({
            email: value.email,
            redirectTo: `${window.location.origin}/reset-password`,
          });
        } catch {
          // Deliberately swallowed, and the success state shown regardless.
          // The endpoint answers identically whether or not the address
          // exists — "If this email exists in our system…" — so surfacing a
          // failure here would leak more than the endpoint itself does, and
          // would turn a transport hiccup into "that account isn't real".
        }
        setSent(true);
        return null;
      },
    },
  });

  if (sent) {
    return (
      <AuthLayout
        title={t("resetTitle")}
        subtitle={t("resetSubtitle")}
        footer={null}
        icon={<MailCheck className="h-6 w-6 text-[var(--color-primary)]" />}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t("resetSent")}
          </p>
          <Link
            to="/sign-in"
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            {t("backToSignInArrow")}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("resetTitle")}
      subtitle={t("resetSubtitle")}
      footer={null}
      icon={<Lock className="h-6 w-6 text-[var(--color-primary)]" />}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="email">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{t("email")}</Label>
              <Input
                id={field.name}
                type="email"
                placeholder={t("emailPlaceholder")}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                required
              />
            </div>
          )}
        </form.Field>

        <form.Subscribe
          selector={(s) => [s.canSubmit, s.isSubmitting] as const}
        >
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              <KeyRound className="h-4 w-4" />
              {isSubmitting ? t("sending") : t("sendResetLink")}
            </Button>
          )}
        </form.Subscribe>

        <Link
          to="/sign-in"
          className="text-center text-sm text-[var(--color-accent)] hover:underline"
        >
          {t("backToSignInArrow")}
        </Link>
      </form>
    </AuthLayout>
  );
}
