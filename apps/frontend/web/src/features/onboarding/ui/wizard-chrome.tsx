import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  WizardLayout as GenericWizardLayout,
  type WizardStatusLabels,
} from "@/shared/components/wizard/wizard-chrome";
import {
  STEP_ORDER,
  isReachable,
  type WizardStep,
} from "@/features/onboarding/domain/screen-model";

/**
 * The onboarding wizard's chrome: the shared layout, bound to this wizard's
 * steps.
 *
 * The rail, the hero heading, the footer and the field wrapper all moved to
 * `shared/components/wizard/` when the service wizard needed the same
 * furniture against a different step list. What is left here is the binding —
 * onboarding's `STEP_ORDER`, its backwards-only reachability rule, its logo
 * and the full-viewport frame it uses by virtue of living outside the provider
 * shell.
 */
export {
  Field,
  HeroQuestion,
  StepFooter,
} from "@/shared/components/wizard/wizard-chrome";

export function WizardLayout({
  current,
  onSeek,
  labels,
  statusLabels,
  onBack,
  backLabel,
  footerNote,
  children,
}: {
  current: WizardStep;
  onSeek: (step: WizardStep) => void;
  labels: Record<WizardStep, string>;
  statusLabels: WizardStatusLabels;
  onBack?: () => void;
  backLabel: string;
  footerNote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <GenericWizardLayout
      steps={STEP_ORDER}
      current={current}
      onSeek={onSeek}
      labels={labels}
      statusLabels={statusLabels}
      isReachable={isReachable}
      {...(onBack ? { onBack } : {})}
      backLabel={backLabel}
      frame="screen"
      brand={
        <Link to="/" className="block">
          <img
            src="/brand/logo-primary.svg"
            alt="Ntizo"
            className="h-7 w-auto lg:h-7"
          />
        </Link>
      }
      {...(footerNote ? { footerNote } : {})}
    >
      {children}
    </GenericWizardLayout>
  );
}
