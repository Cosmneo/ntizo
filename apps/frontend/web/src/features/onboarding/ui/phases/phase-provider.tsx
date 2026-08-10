import { useTranslation } from "react-i18next";
import { Building2, User } from "lucide-react";
import { Button, CitySelect, CountrySelect, Input, cn } from "@ntizo/frontend-ui";
import type { ProviderType } from "@ntizo/shared";
import { useCities } from "@/features/account/viewmodel/use-cities";
import type { ProviderDraft } from "@/features/onboarding/domain/draft";
import type { FieldKey } from "@/features/onboarding/domain/validation";
import type { ProviderSubStep } from "@/features/onboarding/domain/screen-model";
import { Field, HeroQuestion, StepFooter } from "@/features/onboarding/ui/wizard-chrome";

export interface PhaseProviderProps {
  sub: ProviderSubStep;
  draft: ProviderDraft;
  errors: Partial<Record<FieldKey, string>>;
  onChange: (patch: Partial<ProviderDraft>) => void;
  onBack?: () => void;
  onContinue: () => void;
}

export function PhaseProvider({
  sub,
  draft,
  errors,
  onChange,
  onBack,
  onContinue,
}: PhaseProviderProps) {
  const { t, i18n } = useTranslation("onboarding");
  const { t: tc } = useTranslation("auth");
  const { t: ta } = useTranslation("account");
  const err = (key: FieldKey) => (errors[key] ? t(errors[key]!) : undefined);
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const cityQuery = useCities(draft.country, draft.city);

  if (sub === "type") {
    const options = [
      { value: "individual", icon: User },
      { value: "organization", icon: Building2 },
    ] as const;

    return (
      <>
        <HeroQuestion
          eyebrow={t("type.eyebrow")}
          title={t("type.title")}
          description={t("type.description")}
        />

        {/* Cards, not a dropdown. This answer changes what every later screen
            asks and what the workspace can do afterwards, so it deserves to be
            read rather than picked from a list that hides one of the two. */}
        <div role="radiogroup" aria-label={t("type.title")} className="grid gap-4 sm:grid-cols-2">
          {options.map(({ value, icon: Icon }) => {
            const selected = draft.type === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ type: value as ProviderType })}
                className={cn(
                  "rounded-[var(--radius-card)] border p-6 text-left transition-colors",
                  selected
                    ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
                )}
              >
                <span
                  className={cn(
                    "grid h-11 w-11 place-items-center rounded-[var(--radius-card-sm)]",
                    selected
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="type-h3 mt-4 block font-semibold">
                  {t(`type.${value}.title`)}
                </span>
                <span className="type-body mt-1.5 block text-[var(--color-muted-foreground)]">
                  {t(`type.${value}.body`)}
                </span>
              </button>
            );
          })}
        </div>
        {err("type") ? (
          <p className="type-caption mt-3 text-[var(--color-destructive)]">{err("type")}</p>
        ) : null}

        <StepFooter backLabel={t("back")}>
          <Button onClick={onContinue}>{t("continue")}</Button>
        </StepFooter>
      </>
    );
  }

  if (sub === "identity") {
    return (
      <>
        <HeroQuestion
          eyebrow={t("identity.eyebrow")}
          title={t(`identity.title.${draft.type || "individual"}`)}
          description={t("identity.description")}
        />

        <div className="grid gap-5">
          <Field label={t("identity.nameLabel")} hint={t("identity.nameHint")} error={err("name")} htmlFor="name">
            <Input
              id="name"
              value={draft.name}
              autoFocus
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder={t(`identity.namePlaceholder.${draft.type || "individual"}`)}
              // Enter advances. On a phone the Continue button is below the
              // keyboard, and reaching it means dismissing the keyboard first.
              onKeyDown={(e) => e.key === "Enter" && onContinue()}
            />
          </Field>

          <Field label={t("identity.descriptionLabel")} hint={t("identity.descriptionHint")}>
            <textarea
              rows={4}
              value={draft.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder={t("identity.descriptionPlaceholder")}
              className="type-body rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
            />
          </Field>
        </div>

        <StepFooter onBack={onBack} backLabel={t("back")}>
          <Button onClick={onContinue}>{t("continue")}</Button>
        </StepFooter>
      </>
    );
  }

  return (
    <>
      <HeroQuestion
        eyebrow={t("location.eyebrow")}
        title={t("location.title")}
        description={t("location.description")}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={ta("addrCountry")} error={err("country")} htmlFor="country">
          <CountrySelect
            id="country"
            value={draft.country}
            onChange={(code) => onChange({ country: code, city: "" })}
            locale={locale}
            ariaLabel={ta("addrCountry")}
            searchPlaceholder={tc("countrySearchPlaceholder")}
            noResultsText={tc("countryNoResults")}
          />
        </Field>

        <Field label={ta("addrCity")} error={err("city")} htmlFor="city">
          <CitySelect
            id="city"
            value={draft.city}
            onChange={(city) => onChange({ city })}
            cities={cityQuery.cities}
            loading={cityQuery.loading}
            placeholder={ta("addrCityPlaceholder")}
            toggleLabel={ta("addrCityToggle")}
            noResultsText={ta("addrCityNoResults")}
            loadingText={ta("addrCityLoading")}
          />
        </Field>

        <Field label={ta("addrDistrict")} htmlFor="district">
          <Input
            id="district"
            value={draft.district}
            onChange={(e) => onChange({ district: e.target.value })}
          />
        </Field>

        <Field label={ta("addrLine1")} hint={t("location.streetHint")} htmlFor="street">
          <Input
            id="street"
            value={draft.street}
            onChange={(e) => onChange({ street: e.target.value })}
          />
        </Field>
      </div>

      <StepFooter onBack={onBack} backLabel={t("back")}>
        <Button onClick={onContinue}>{t("continue")}</Button>
      </StepFooter>
    </>
  );
}
