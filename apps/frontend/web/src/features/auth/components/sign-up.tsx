import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import {
  Button,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Label,
} from "@ntizo/frontend-ui";
import { authClient } from "@/shared/lib/api/auth-client";
import { AuthLayout } from "@/features/auth/components/auth-layout";

export function SignUp() {
  const { t } = useTranslation("auth");
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
    validators: {
      onSubmitAsync: async ({ value }) => {
        const { error } = await authClient.signUp.email({
          email: value.email,
          password: value.password,
          name: `${value.firstName} ${value.lastName}`.trim(),
          firstName: value.firstName,
          lastName: value.lastName,
        } as Parameters<typeof authClient.signUp.email>[0]);
        if (error) return { form: error.message ?? "Sign up failed" };
        setSubmitted(value.email);
        return null;
      },
    },
  });

  if (submitted) {
    return (
      <AuthLayout
        title={t("checkYourEmail")}
        subtitle={t("verificationSent", { email: submitted })}
        footer={
          <>
            {t("alreadyHaveAccount")}{" "}
            <Link to="/sign-in" className="text-[var(--color-accent)] hover:underline">
              {t("signIn")}
            </Link>
          </>
        }
      >
        <div />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("createYourAccount")}
      subtitle={t("joinAsProvider")}
      footer={
        <>
          {t("alreadyHaveAccount")}{" "}
          <Link to="/sign-in" className="text-[var(--color-accent)] hover:underline">
            {t("signIn")}
          </Link>
        </>
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
                {String(err)}
              </div>
            ) : null
          }
        </form.Subscribe>

        <div className="grid grid-cols-2 gap-3">
          <form.Field name="firstName">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>{t("firstName")}</Label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          </form.Field>
          <form.Field name="lastName">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={field.name}>{t("lastName")}</Label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
              </div>
            )}
          </form.Field>
        </div>

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

        <form.Field name="password">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{t("password")}</Label>
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
                  <InputGroupButton onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <p className="text-xs text-[var(--color-muted-foreground)]">{t("passwordHint")}</p>
            </div>
          )}
        </form.Field>

        <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              <UserPlus className="h-4 w-4" />
              {isSubmitting ? t("creatingAccount") : t("createAccount")}
            </Button>
          )}
        </form.Subscribe>

        <p className="text-xs text-center text-[var(--color-muted-foreground)]">
          {t("terms")}
        </p>
      </form>
    </AuthLayout>
  );
}
