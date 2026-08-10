import { useTranslation } from "react-i18next";
import { Banknote, Smartphone } from "lucide-react";
import { Button, Input, cn } from "@ntizo/frontend-ui";
import { PaymentMethodType, PAYOUT_CAPABLE_TYPES } from "@ntizo/shared";
import type { ProviderDraft } from "@/features/onboarding/domain/draft";
import { Field, HeroQuestion, StepFooter } from "@/features/onboarding/ui/wizard-chrome";

const ICONS: Partial<Record<string, typeof Banknote>> = {
  [PaymentMethodType.MPesa]: Smartphone,
  [PaymentMethodType.EMola]: Smartphone,
  [PaymentMethodType.BankAccount]: Banknote,
};

/**
 * How the provider gets paid.
 *
 * Skippable, and the skip is a real button rather than a hidden option. This
 * screen sits between someone and the thing they came to do; a payout account
 * can be added the day before the first booking, and losing an applicant here
 * costs more than the missing field.
 *
 * The types come from the shared enum filtered to those that can receive money
 * — a card can be charged and cannot be paid out, and offering it here would
 * be offering a dead end.
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
  const { t } = useTranslation("onboarding");

  return (
    <>
      <HeroQuestion
        eyebrow={t("payout.eyebrow")}
        title={t("payout.title")}
        description={t("payout.description")}
      />

      <div role="radiogroup" aria-label={t("payout.title")} className="grid gap-3">
        {PAYOUT_CAPABLE_TYPES.map((type) => {
          const Icon = ICONS[type] ?? Banknote;
          const selected = draft.payoutType === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ payoutType: type, payoutIdentifier: "" })}
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
            <Input
              id="payout-identifier"
              value={draft.payoutIdentifier}
              onChange={(e) => onChange({ payoutIdentifier: e.target.value })}
            />
          </Field>
        </div>
      ) : null}

      <StepFooter onBack={onBack} backLabel={t("back")}>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={onContinue}>
            {t("payout.skip")}
          </Button>
          <Button onClick={onContinue} disabled={!draft.payoutType}>
            {t("continue")}
          </Button>
        </div>
      </StepFooter>
    </>
  );
}
