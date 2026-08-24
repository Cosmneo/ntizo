import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { useOnboarding } from "@/features/onboarding/viewmodel/use-onboarding";
import { WizardLayout } from "@/features/onboarding/ui/wizard-chrome";
import { PhaseProvider } from "@/features/onboarding/ui/phases/phase-provider";
import { PhasePayout } from "@/features/onboarding/ui/phases/phase-payout";
import { PhaseMedia } from "./phases/phase-media";
import { PhaseDocuments } from "@/features/onboarding/ui/phases/phase-documents";
import { PhaseReview } from "@/features/onboarding/ui/phases/phase-review";
import {
  STEP_ORDER,
  type WizardStep,
} from "@/features/onboarding/domain/screen-model";

/**
 * The provider onboarding wizard.
 *
 * The rail and the content, with each step's screen swapped into the right-hand
 * column. Nothing here decides anything — the viewmodel owns the state and the
 * domain owns the order.
 */
export function OnboardingPage() {
  const { t } = useTranslation("onboarding");
  const vm = useOnboarding();

  const labels = Object.fromEntries(
    STEP_ORDER.map((step) => [step, t(`step.${step}`)]),
  ) as Record<WizardStep, string>;

  return (
    <WizardLayout
      current={vm.step}
      onSeek={vm.setStep}
      labels={labels}
      statusLabels={{
        done: t("status.done"),
        active: t("status.active"),
        stepPrefix: t("status.stepPrefix"),
      }}
      // The last screen has nothing behind it to go back to.
      {...(vm.step !== "type" && vm.step !== "review"
        ? { onBack: vm.back }
        : {})}
      backLabel={t("back")}
      footerNote={
        <Trans
          t={t}
          i18nKey="alreadyProvider"
          components={{
            a: (
              <Link
                to="/provider"
                className="font-semibold text-[var(--color-primary)]"
              />
            ),
          }}
        />
      }
    >
      {vm.submitError ? (
        <p className="type-body-medium mb-6 rounded-[var(--radius-field)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] px-4 py-3 text-[var(--color-destructive)]">
          {vm.submitError}
        </p>
      ) : null}

      {vm.step === "type" ||
      vm.step === "identity" ||
      vm.step === "location" ? (
        <PhaseProvider
          sub={vm.step}
          draft={vm.draft}
          errors={vm.errors}
          onChange={vm.patch}
          {...(vm.step !== "type" ? { onBack: vm.back } : {})}
          onContinue={vm.advance}
        />
      ) : null}

      {vm.step === "media" ? (
        <PhaseMedia onBack={vm.back} onContinue={vm.advance} />
      ) : null}

      {vm.step === "payout" ? (
        <PhasePayout
          draft={vm.draft}
          onChange={vm.patch}
          onBack={vm.back}
          onContinue={vm.advance}
        />
      ) : null}

      {vm.step === "documents" ? (
        <PhaseDocuments
          draft={vm.draft}
          uploads={vm.uploads}
          onUpload={vm.addUpload}
          onRemove={vm.removeUpload}
          busy={vm.uploadingDocument}
          errorKey={vm.documentErrorKey}
          onBack={vm.back}
          onContinue={vm.advance}
        />
      ) : null}

      {vm.step === "review" ? (
        <PhaseReview providerName={vm.draft.name} />
      ) : null}
    </WizardLayout>
  );
}
