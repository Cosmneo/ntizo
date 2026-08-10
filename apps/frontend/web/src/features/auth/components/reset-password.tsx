import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Label,
} from "@ntizo/frontend-ui";
import { authClient } from "@/shared/lib/api/auth-client";
import { AuthLayout } from "@/features/auth/components/auth-layout";

/**
 * Where the emailed link lands.
 *
 * This page is what makes the reset flow real — without it the message that
 * better-auth already sends today points at a 404. The token arrives as a
 * query parameter; better-auth validates it server-side, so nothing here
 * inspects or trusts it beyond passing it back.
 */
export function ResetPassword() {
  const { t } = useTranslation("auth");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { token } = useSearch({ strict: false }) as { token?: string };

  const form = useForm({
    defaultValues: { password: "", confirm: "" },
    validators: {
      onSubmitAsync: async ({ value }) => {
        if (!token) return { form: t("resetTokenMissing") };
        if (value.password !== value.confirm)
          return { form: t("passwordsDoNotMatch") };
        try {
          const { error } = await authClient.resetPassword({
            newPassword: value.password,
            token,
          });
          if (error) return { form: error.message ?? t("resetFailed") };
          navigate({ to: "/sign-in" });
          return null;
        } catch (err) {
          return {
            form: err instanceof Error ? err.message : t("resetFailed"),
          };
        }
      },
    },
  });

  return (
    <AuthLayout
      title={t("newPasswordTitle")}
      subtitle={t("newPasswordSubtitle")}
      footer={
        <Link
          to="/sign-in"
          className="text-[var(--color-accent)] hover:underline"
        >
          {t("backToSignInArrow")}
        </Link>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Subscribe selector={(s) => s.errorMap.onSubmit}>
          {(err) =>
            err ? (
              <div className="text-sm text-[var(--color-destructive)] text-center">
                {err.form}
              </div>
            ) : null
          }
        </form.Subscribe>

        <form.Field name="password">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{t("newPassword")}</Label>
              <InputGroup>
                <InputGroupInput
                  id={field.name}
                  type={showPassword ? "text" : "password"}
                  placeholder={t("createPassword")}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                  minLength={8}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? t("hidePassword") : t("showPassword")
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {t("passwordHint")}
              </p>
            </div>
          )}
        </form.Field>

        <form.Field name="confirm">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{t("confirmPassword")}</Label>
              <InputGroupInput
                id={field.name}
                type={showPassword ? "text" : "password"}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                required
                minLength={8}
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
              {isSubmitting ? t("saving") : t("setNewPassword")}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthLayout>
  );
}
