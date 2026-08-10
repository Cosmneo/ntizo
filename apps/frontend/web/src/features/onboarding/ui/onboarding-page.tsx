import { useTranslation } from "react-i18next";
import { useOnboarding } from "@/features/onboarding/viewmodel/use-onboarding";
import { PhaseChips } from "@/features/onboarding/ui/wizard-chrome";
import { PhaseProvider } from "@/features/onboarding/ui/phases/phase-provider";
import { PhasePayout } from "@/features/onboarding/ui/phases/phase-payout";
import { PhaseReview } from "@/features/onboarding/ui/phases/phase-review";
import type { OnboardingPhase } from "@/features/onboarding/domain/screen-model";

/**
 * The provider onboarding wizard.
 *
 * Narrow and centred, and outside the provider zone entirely — see the route.
 * The shell's sidebar would offer Members and Settings to someone whose
 * provider does not exist yet, and exits at the one moment leaving loses work.
 */
export function OnboardingPage() {
  const { t } = useTranslation("onboarding");
  const vm = useOnboarding();

  const labels: Record<OnboardingPhase, string> = {
    1: t("phase.provider"),
    2: t("phase.payout"),
    3: t("phase.review"),
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-10 pb-16">
      {/* The last screen has nothing left to navigate, and a progress strip
          above a finished thing invites the reader to look for a next step. */}
      {vm.screen.phase !== 3 ? (
        <PhaseChips current={vm.screen} onSeek={vm.setScreen} labels={labels} />
      ) : (
        <div className="h-8" />
      )}

      {vm.submitError ? (
        <p className="type-body-medium mb-6 rounded-[var(--radius-field)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] px-4 py-3 text-[var(--color-destructive)]">
          {vm.submitError}
        </p>
      ) : null}

      {vm.screen.phase === 1 ? (
        <PhaseProvider
          sub={vm.screen.sub}
          draft={vm.draft}
          errors={vm.errors}
          onChange={vm.patch}
          {...(vm.screen.sub !== "type" ? { onBack: vm.back } : {})}
          onContinue={vm.advance}
        />
      ) : null}

      {vm.screen.phase === 2 ? (
        <PhasePayout
          draft={vm.draft}
          onChange={vm.patch}
          onBack={vm.back}
          onContinue={vm.advance}
        />
      ) : null}

      {vm.screen.phase === 3 ? <PhaseReview providerName={vm.draft.name} /> : null}
    </div>
  );
}
