import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@ntizo/frontend-ui";
import {
  HeroQuestion,
  StepFooter,
  WizardLayout,
} from "@/shared/components/wizard/wizard-chrome";
import { useServiceWizard } from "../viewmodel/use-service-wizard";
import type { ServiceStep } from "../domain/wizard-model";
import { StepBasics } from "./steps/step-basics";
import { StepBooking } from "./steps/step-booking";
import { StepPerformers } from "./steps/step-performers";
import { StepTiming } from "./steps/step-timing";
import { StepPricing } from "./steps/step-pricing";
import { StepLanguages } from "./steps/step-languages";
import { StepReview } from "./steps/step-review";

/**
 * Creating and editing a service, as the same wizard the provider met during
 * onboarding.
 *
 * It replaces a section-rail editor whose every screen carried a status badge,
 * a progress ring and a sticky save bar. That page answered "what is left?" on
 * all five sections at once, which is the right question for an editor and the
 * wrong one for a first-time creation: a provider filling in a name read the
 * publish blocker for options as a complaint rather than as step five.
 *
 * The chrome, the rail and the hero heading are the shared wizard components
 * in `shared/components/wizard/`; the step list comes from `wizard-model.ts`
 * and varies per service; nothing here decides anything. Which steps exist,
 * which are reachable and when the server is spoken to all live in the domain
 * and the viewmodel.
 */
export function ServiceWizardPage() {
  const { t } = useTranslation("provider");
  const vm = useServiceWizard();

  if (!vm.provider) return null;
  // Rebound so TypeScript can prove it stays non-null inside the closures below.
  const provider = vm.provider;

  const labels = Object.fromEntries(
    vm.steps.map((step) => [step, t(`serviceStep.${step}`)]),
  ) as Record<ServiceStep, string>;

  const isReview = vm.step === "review";
  const memberError = vm.memberErrorCode ? t(`serviceError.${vm.memberErrorCode}`) : undefined;

  function renderStep() {
    switch (vm.step) {
      case "basics":
        return (
          <StepBasics
            draft={vm.draft}
            setDraft={vm.setDraft}
            categories={vm.categories}
            locationChoice={vm.locationChoice}
            onLocationChoiceChange={vm.setLocationChoice}
          />
        );
      case "booking":
        return (
          <StepBooking
            draft={vm.draft}
            setDraft={vm.setDraft}
            canChangeBookingMode={vm.canChangeBookingMode}
          />
        );
      case "performers":
        return (
          <StepPerformers
            draft={vm.draft}
            setDraft={vm.setDraft}
            members={vm.members}
            {...(memberError ? { error: memberError } : {})}
            onErrorClear={vm.clearMemberError}
          />
        );
      case "timing":
        return (
          <StepTiming draft={vm.draft} setDraft={vm.setDraft} fieldErrors={vm.fieldErrors} />
        );
      case "pricing":
        return (
          <StepPricing
            draft={vm.draft}
            providerId={provider.id}
            serviceId={vm.serviceId}
            options={vm.current?.options ?? []}
          />
        );
      case "languages":
        // Needs a saved service: `service.translation.set` addresses rows by
        // service id. Reachable only after `CREATES_SERVICE`, so the fallback
        // covers just the beat between the create resolving and the list
        // refetching.
        return vm.current ? (
          <StepLanguages service={vm.current} providerId={provider.id} />
        ) : (
          <p className="type-body text-[var(--color-muted-foreground)]">
            {t("serviceTranslationsSaveFirst")}
          </p>
        );
      case "review":
        return (
          <StepReview
            service={vm.current}
            blocker={vm.blocker}
            blockerStep={vm.blockerStep}
            onSeek={vm.seek}
            canPublish={vm.canPublish}
            busy={vm.statusChanging}
            onChangeStatus={(status) => void vm.changeStatus(status)}
          />
        );
      default:
        return null;
    }
  }

  return (
    <WizardLayout
      steps={vm.steps}
      current={vm.step}
      onSeek={vm.seek}
      labels={labels}
      statusLabels={{
        done: t("serviceStepStatus.done"),
        active: t("serviceStepStatus.active"),
        stepPrefix: t("serviceStepStatus.stepPrefix"),
      }}
      isReachable={vm.isReachable}
      onBack={vm.back}
      backLabel={t("serviceWizardBack")}
      frame="inset"
      brand={
        <Link
          to="/provider/$slug/services"
          params={{ slug: provider.slug }}
          className="type-body inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("servicesTitle")}
        </Link>
      }
    >
      {vm.errorCode ? (
        <p className="type-body-medium mb-6 rounded-[var(--radius-field)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] px-4 py-3 text-[var(--color-destructive)]">
          {t(`serviceError.${vm.errorCode}`, { defaultValue: t("serviceSaveFailed") })}
        </p>
      ) : null}

      <HeroQuestion
        title={t(`serviceStepTitle.${vm.step}`)}
        description={t(`serviceStepDescription.${vm.step}`)}
      />

      {renderStep()}

      {/* Only the essentials need this. `timing` — the one other step that can
          refuse — already renders its own message under the buffer field, and
          a second copy here would report one fault twice. */}
      {vm.showStepError && vm.step === "basics" ? (
        <p className="type-caption mt-4 text-[var(--color-destructive)]">
          {t("serviceStepIncomplete")}
        </p>
      ) : null}

      <StepFooter
        onBack={vm.back}
        backLabel={t("serviceWizardBack")}
        secondary={
          // Only once there is something to save and somewhere to return to.
          // On a brand-new service the primary button *is* the save.
          vm.saved ? (
            <Button type="button" variant="outline" onClick={() => void vm.saveAndExit()}>
              {t("serviceWizardSaveExit")}
            </Button>
          ) : undefined
        }
      >
        {isReview ? (
          <Button
            type="button"
            disabled={!vm.canPublish || vm.blocker !== null || vm.statusChanging}
            onClick={() => void vm.changeStatus("published")}
          >
            {vm.statusChanging ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("servicePublish")}
          </Button>
        ) : (
          <Button type="button" disabled={vm.saving} onClick={() => void vm.advance()}>
            {vm.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("serviceWizardContinue")}
          </Button>
        )}
      </StepFooter>
    </WizardLayout>
  );
}
