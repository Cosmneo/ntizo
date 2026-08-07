import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { Eye, EyeOff, LogIn } from "lucide-react";
import {
  Button,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Label,
  Separator,
} from "@ntizo/frontend-ui";
import { authClient } from "@/shared/lib/api/auth-client";
import { resolveDestinationForSession } from "@/features/provider/viewmodel/post-login";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { GoogleIcon, MicrosoftIcon } from "@/shared/components/icons";

export function SignIn() {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { next } = useSearch({ strict: false }) as { next?: string };

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: {
      onSubmitAsync: async ({ value }) => {
        const { error } = await authClient.signIn.email({
          email: value.email,
          password: value.password,
        });
        if (error) return { form: error.message ?? "Sign in failed" };
        navigate({ to: await resolveDestinationForSession(next ?? null) });
        return null;
      },
    },
  });

  return (
    <AuthLayout
      title="Ntizo"
      subtitle={t("signInToAccount")}
      footer={
        <>
          {t("dontHaveAccount")}{" "}
          <Link to="/sign-up" className="text-[var(--color-accent)] hover:underline">
            {t("signUp")}
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
          {(error) =>
            error ? (
              <div className="text-sm text-[var(--color-destructive)] text-center">
                {error.form}
              </div>
            ) : null
          }
        </form.Subscribe>

        <form.Field name="email">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field.name}>{t("email")}</Label>
              <Input
                id={field.name}
                type="email"
                placeholder={t("emailPlaceholder")}
                value={field.state.value}
                onBlur={field.handleBlur}
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
                  placeholder={t("passwordPlaceholder")}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  required
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
          )}
        </form.Field>

        <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              <LogIn className="h-4 w-4" />
              {isSubmitting ? t("signingIn") : t("signIn")}
            </Button>
          )}
        </form.Subscribe>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {tc("orContinueWith")}
          </span>
          <Separator className="flex-1" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              authClient.signIn.social({ provider: "google", callbackURL: "/sign-in" })
            }
          >
            <GoogleIcon className="h-4 w-4" />
            {tc("google")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              authClient.signIn.social({ provider: "microsoft", callbackURL: "/sign-in" })
            }
          >
            <MicrosoftIcon className="h-4 w-4" />
            {tc("microsoft")}
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
