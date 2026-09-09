import { useTranslation } from "react-i18next";
import { Banknote, Smartphone } from "lucide-react";
import { Button, Input, PhoneInput, cn } from "@ntizo/frontend-ui";
import {
  PaymentIdentifierKind,
  PaymentMethodType,
  identifierKindFor,
} from "@ntizo/shared";
import type { ProviderDraft } from "@/features/onboarding/domain/draft";
import {
  Field,
  HeroQuestion,
  StepFooter,
} from "@/features/onboarding/ui/wizard-chrome";

const ICONS: Partial<Record<string, typeof Banknote>> = {
  [PaymentMethodType.MPesa]: Smartphone,
  [PaymentMethodType.EMola]: Smartphone,
  [PaymentMethodType.BankAccount]: Banknote,
};

/**
 * The payout methods this screen offers — deliberately narrower than
 * `PAYOUT_CAPABLE_TYPES`.
 *
 * e-Mola and bank transfer are hidden here while only M-Pesa is wired end to
 * end. This is a presentation choice and nothing else: `PAYOUT_CAPABLE_TYPES`
 * still names all three, so `supportsDirection` keeps accepting the providers
 * already saved on the other two and their existing payout details keep
 * working. Narrowing the shared constant instead would have made those rows
 * invalid retroactively.
 *
 * To bring one back, add it here — the copy, icons and identifier handling for
 * all three are already in place and were left untouched.
 */
const OFFERED_PAYOUT_TYPES = [PaymentMethodType.MPesa] as const;

/**
 * How the provider gets paid.
 *
 * Skippable, and the skip is a real button rather than a hidden option. This
 * screen sits between someone and the thing they came to do; a payout account
 * can be added the day before the first booking, and losing an applicant here
 * costs more than the missing field.
 *
 * The types come from `OFFERED_PAYOUT_TYPES` above, which is narrower than the
 * shared enum's payout-capable set on purpose: a card can be charged and
 * cannot be paid out, and of the three that can, only M-Pesa is offered for
 * now. See that constant for why the shared list was left alone.
 */
export function PhasePayout({
  draft,
  onChange,
  onBack,
  onContinue,
}: {
  draft: ProviderDraft;
  onChange: (patch: Partial<ProviderDraft>) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t, i18n } = useTranslation("onboarding");
  const { t: ta } = useTranslation("auth");

  return (
    <>
      <HeroQuestion
        title={t("payout.title")}
        description={t("payout.description")}
      />

      <div
        role="radiogroup"
        aria-label={t("payout.title")}
        className="grid gap-3"
      >
        {OFFERED_PAYOUT_TYPES.map((type) => {
          const Icon = ICONS[type] ?? Banknote;
          const selected = draft.payoutType === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() =>
                onChange({ payoutType: type, payoutIdentifier: "" })
              }
              className={cn(
                "flex items-center gap-3.5 rounded-[var(--radius-card-sm)] border px-5 py-4 text-left transition-colors",
                selected
                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  selected
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-muted-foreground)]",
                )}
              />
              <span className="min-w-0">
                <span className="type-body-medium block font-semibold">
                  {t(`payout.method.${type}.title`)}
                </span>
                <span className="type-caption block text-[var(--color-muted-foreground)]">
                  {t(`payout.method.${type}.body`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {draft.payoutType ? (
        <div className="mt-5">
          <Field
            label={t(`payout.method.${draft.payoutType}.identifierLabel`)}
            hint={t(`payout.method.${draft.payoutType}.identifierHint`)}
            htmlFor="payout-identifier"
          >
            {/* A mobile wallet is keyed by a phone number, so it gets the phone
                field — the same one sign-up uses, with the country prefix
                picked rather than typed. The aggregate stores these in E.164
                and rejects bare national digits, so a plain text box here would
                collect something the backend then refuses.

                Which kind of string a method takes is the shared enum's
                answer, not a list repeated here. */}
            {identifierKindFor(draft.payoutType as PaymentMethodType) ===
            PaymentIdentifierKind.PhoneNumber ? (
              <PhoneInput
                id="payout-identifier"
                value={draft.payoutIdentifier}
                onChange={(next) => onChange({ payoutIdentifier: next })}
                defaultCountry="MZ"
                locale={i18n.resolvedLanguage ?? i18n.language}
                placeholder={ta("phonePlaceholder")}
                searchPlaceholder={ta("countrySearchPlaceholder")}
                noResultsText={ta("countryNoResults")}
                countrySelectLabel={ta("countrySelectLabel")}
              />
            ) : (
              <Input
                id="payout-identifier"
                value={draft.payoutIdentifier}
                onChange={(e) => onChange({ payoutIdentifier: e.target.value })}
              />
            )}
          </Field>
        </div>
      ) : null}

      <StepFooter
        onBack={onBack}
        backLabel={t("back")}
        secondary={
          <Button type="button" variant="outline" onClick={onContinue}>
            {t("payout.skip")}
          </Button>
        }
      >
        <Button onClick={onContinue} disabled={!draft.payoutType}>
          {t("continue")}
        </Button>
      </StepFooter>
    </>
  );
}
