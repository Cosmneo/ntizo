import { useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { isSafeInternalPath } from "@/shared/lib/zones";
import { useForm } from "@tanstack/react-form";
import { Eye, EyeOff, UserPlus, MailCheck } from "lucide-react";
import { isValidPhoneNumber } from "libphonenumber-js";
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Label,
  PhoneInput,
  Separator,
} from "@ntizo/frontend-ui";
import { authClient } from "@/shared/lib/api/auth-client";
import { AuthSplitLayout } from "@/features/auth/components/auth-split-layout";
import { GoogleIcon } from "@/shared/components/icons";
import { authErrorMessage } from "@/features/auth/viewmodel/auth-error";

export function SignUp() {
  const { t, i18n } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  // Where to go once the address is verified. `strict: false` so this works
  // whether or not the route declares the param.
  const { next } = useSearch({ strict: false }) as { next?: string };
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      acceptTerms: false,
    },
    validators: {
      onSubmitAsync: async ({ value }) => {
        // Checked here as well as via the input's `required`: the native
        // attribute gives fast feedback, this is the one that cannot be
        // removed with devtools.
        if (!value.acceptTerms) return { form: t("mustAcceptTerms") };
        // Re-checked against the same library the server validates with, so
        // a number that passes here cannot be rejected there. `value.phone`
        // is already E.164 — PhoneInput emits nothing else.
        if (!isValidPhoneNumber(value.phone))
          return { form: t("invalidPhone") };
        try {
          const { error } = await authClient.signUp.email({
            email: value.email,
            password: value.password,
            name: `${value.firstName} ${value.lastName}`.trim(),
            firstName: value.firstName,
            lastName: value.lastName,
            phoneNumber: value.phone,
            // Absolute, and pointing at this app. better-auth builds the
            // verification link off its own baseURL (the API origin) and
            // redirects here afterwards — without this the user lands on the
            // API's JSON root instead of the app. Origin-checked server-side
            // against trustedOrigins, which already includes this origin.
            //
            // The path carries the intent through verification. Someone who
            // arrived from "become a provider" comes back to `/onboarding`
            // rather than the customer home — which is where the chain used to
            // break: they registered, landed on `/`, and the thing they came to
            // do was never offered again.
            //
            // Checked with `isSafeInternalPath` because this ends up in a URL a
            // server redirects to, and an unchecked `next` is an open redirect.
            callbackURL: `${window.location.origin}${
              isSafeInternalPath(next ?? null) ? next : "/"
            }`,
            // The language on screen, not the browser's own. Someone reading
            // the app in Portuguese with an English-configured browser gets
            // Portuguese email, which is the whole point — and this is the
            // only request that can say so, because the profile is created
            // from it and nothing afterwards knows what was on the screen.
            fetchOptions: { headers: { "Accept-Language": i18n.language } },
          } as Parameters<typeof authClient.signUp.email>[0]);
          if (error) return { form: authErrorMessage(t, error) };
          setSubmitted(value.email);
          return null;
        } catch (err) {
          // authClient doesn't set throw:true/catchAllError, so a
          // network-level failure rejects instead of resolving {error} —
          // normalize it the same way so the form always has a message to
          // show, instead of `.form` being undefined on a bare thrown value.
          return { form: authErrorMessage(t, err) };
        }
      },
    },
  });

  const panel = {
    pitch: t("pitchSignUp"),
    pointsAsList: true as const,
    points: [t("proofVerified"), t("proofEscrow"), t("proofRealReviews")],
  };

  if (submitted) {
    return (
      <AuthSplitLayout {...panel}>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="rounded-full bg-[var(--color-muted)] p-3">
              <MailCheck className="h-6 w-6 text-[var(--color-accent)]" />
            </div>
            <h1 className="text-xl font-semibold">{t("checkYourEmail")}</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t("verificationSent", { email: submitted })}
            </p>
            <Link
              to="/sign-in"
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              {t("backToSignIn")}
            </Link>
          </CardContent>
        </Card>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout {...panel}>
      <Card>
        <CardContent className="flex flex-col gap-6 p-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">{t("createYourAccount")}</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t("fastAndFree")}
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
              {(err) =>
                err ? (
                  <div className="text-sm text-[var(--color-destructive)] text-center">
                    {err.form}
                  </div>
                ) : null
              }
            </form.Subscribe>

            {/* Two fields, not one "full name". A single field forces a guess
                at where the surname begins, and the profile stores them
                separately — the mockup shows one field, but the data model and
                Mozambican naming both argue against it. */}
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

            <form.Field name="phone">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>{t("phone")}</Label>
                  <PhoneInput
                    id={field.name}
                    value={field.state.value}
                    onChange={(next) => field.handleChange(next)}
                    onBlur={field.handleBlur}
                    // Mozambique is the launch market, so it is the sensible
                    // first guess — but every country is one search away.
                    defaultCountry="MZ"
                    locale={i18n.language}
                    placeholder={t("phonePlaceholder")}
                    searchPlaceholder={t("countrySearchPlaceholder")}
                    noResultsText={t("countryNoResults")}
                    countrySelectLabel={t("countrySelectLabel")}
                    required
                  />
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {t("phoneHint")}
                  </p>
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

            <form.Field name="acceptTerms">
              {(field) => (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    id={field.name}
                    checked={field.state.value}
                    onChange={(e) => field.handleChange(e.target.checked)}
                    className="mt-0.5"
                    required
                  />
                  <span className="text-[var(--color-muted-foreground)]">
                    {t("acceptTerms")}
                  </span>
                </label>
              )}
            </form.Field>

            <form.Subscribe
              selector={(s) => [s.canSubmit, s.isSubmitting] as const}
            >
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" className="w-full" disabled={!canSubmit}>
                  <UserPlus className="h-4 w-4" />
                  {isSubmitting ? t("creatingAccount") : t("createAccount")}
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

            {/* One column: Microsoft is gone and a lone button in a
                two-column grid sits at half width beside a hole. */}
            <div className="grid grid-cols-1">
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
            </div>
          </form>

          <p className="text-center text-sm text-[var(--color-muted-foreground)]">
            {t("alreadyHaveAccount")}{" "}
            <Link
              to="/sign-in"
              className="text-[var(--color-accent)] hover:underline"
            >
              {t("signIn")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthSplitLayout>
  );
}
