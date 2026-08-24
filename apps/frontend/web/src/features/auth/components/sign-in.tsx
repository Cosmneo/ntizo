import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { Eye, EyeOff, LogIn } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Label,
  Separator,
} from "@ntizo/frontend-ui";
import { authClient } from "@/shared/lib/api/auth-client";
import { useClearSessionQueryCache } from "@/features/user/viewmodel/use-current-user";
import { resolveDestinationForSession } from "@/features/provider/viewmodel/post-login";
import { AuthSplitLayout } from "@/features/auth/components/auth-split-layout";
import { GoogleIcon, MicrosoftIcon } from "@/shared/components/icons";

export function SignIn() {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { next } = useSearch({ strict: false }) as { next?: string };
  const clearSessionQueryCache = useClearSessionQueryCache();

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: {
      onSubmitAsync: async ({ value }) => {
        try {
          const { error } = await authClient.signIn.email({
            email: value.email,
            password: value.password,
          });
          if (error) return { form: error.message ?? "Sign in failed" };
          // Clear before navigating, for the same reason sign-out does.
          //
          // The sign-in page is itself signed out, so any session-scoped
          // query mounted on it — `user.me` among them, now that the mobile
          // bar reads it on every page — resolves to "not signed in" and
          // that answer sits in the cache. Navigating without clearing hands
          // the authenticated shell the signed-out result, and it renders an
          // account menu with no account in it.
          clearSessionQueryCache();
          navigate({ to: await resolveDestinationForSession(next ?? null) });
          return null;
        } catch (err) {
          // authClient doesn't set throw:true/catchAllError, so a
          // network-level failure rejects instead of resolving {error} —
          // normalize it the same way so the form always has a message to
          // show, instead of `.form` being undefined on a bare thrown value.
          return {
            form:
              err instanceof Error
                ? err.message
                : "Something went wrong. Please try again.",
          };
        }
      },
    },
  });

  return (
    <AuthSplitLayout
      pitch={t("pitchSignIn")}
      points={[
        t("proofVerified"),
        t("proofSecurePayment"),
        t("proofRealReviews"),
      ]}
    >
      <Card>
        <CardContent className="flex flex-col gap-6 p-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">{t("welcomeBack")}</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t("signInToAccount")}
            </p>
          </div>

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
                  <Link
                    to="/forgot-password"
                    className="self-end text-xs text-[var(--color-accent)] hover:underline"
                  >
                    {t("forgotPassword")}
                  </Link>
                </div>
              )}
            </form.Field>

            <form.Subscribe
              selector={(s) => [s.canSubmit, s.isSubmitting] as const}
            >
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
                  authClient.signIn.social({
                    provider: "google",
                    callbackURL: "/sign-in",
                  })
                }
              >
                <GoogleIcon className="h-4 w-4" />
                {tc("google")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  authClient.signIn.social({
                    provider: "microsoft",
                    callbackURL: "/sign-in",
                  })
                }
              >
                <MicrosoftIcon className="h-4 w-4" />
                {tc("microsoft")}
              </Button>
            </div>
          </form>

          <p className="text-center text-sm text-[var(--color-muted-foreground)]">
            {t("dontHaveAccount")}{" "}
            <Link
              to="/sign-up"
              className="text-[var(--color-accent)] hover:underline"
            >
              {t("signUp")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthSplitLayout>
  );
}
