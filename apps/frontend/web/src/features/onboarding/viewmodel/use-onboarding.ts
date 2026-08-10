import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ProviderType } from "@ntizo/shared";
import {
  EMPTY_DRAFT,
  clearDraft,
  readDraft,
  slugFrom,
  writeDraft,
  type ProviderDraft,
} from "@/features/onboarding/domain/draft";
import {
  FIRST_SCREEN,
  nextScreen,
  previousScreen,
  type OnboardingScreen,
  type ProviderSubStep,
} from "@/features/onboarding/domain/screen-model";
import {
  firstIncompleteStep,
  validateStep,
  type FieldKey,
} from "@/features/onboarding/domain/validation";
import { useCreateProvider } from "@/features/provider/viewmodel/use-provider-mutations";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";

/**
 * The wizard's state, and the one place that decides when to talk to the server.
 *
 * The provider is created once, at the end of phase 1 — not field by field and
 * not at the very end. Creating it earlier would leave half-built rows behind
 * every abandoned attempt; creating it at the very end would mean the payout
 * screen has no provider to attach a method to.
 */
export function useOnboarding() {
  const navigate = useNavigate();
  const create = useCreateProvider();
  const { setActive, refresh } = useActiveProvider();

  const [screen, setScreen] = useState<OnboardingScreen>(FIRST_SCREEN);
  const [draft, setDraft] = useState<ProviderDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  // Read after mount. `sessionStorage` does not exist during the server render,
  // and seeding from it there would render one draft and hydrate another.
  useEffect(() => {
    setDraft(readDraft());
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) writeDraft(draft);
  }, [draft, restored]);

  const patch = useCallback((next: Partial<ProviderDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    // Clearing on edit rather than on the next Continue: an error still showing
    // beside a field the user has already fixed reads as the fix not counting.
    setErrors((current) => {
      const keys = Object.keys(next) as Array<keyof ProviderDraft>;
      if (!keys.some((k) => k in current)) return current;
      const out = { ...current };
      for (const k of keys) delete out[k as FieldKey];
      return out;
    });
  }, []);

  const submit = useCallback(async () => {
    setSubmitError(null);
    // The whole draft, not only the current step. A restored session can be
    // complete on screen three and empty on screen one, and submitting that
    // would fail server-side with a message pointing nowhere.
    const gap = firstIncompleteStep(draft);
    if (gap) {
      setScreen({ phase: 1, sub: gap });
      setErrors(validateStep(gap, draft));
      return;
    }

    try {
      const { providerId } = await create.mutateAsync({
        type: (draft.type || ProviderType.Individual) as ProviderType,
        name: draft.name.trim(),
        slug: slugFrom(draft.name),
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        address: {
          country: draft.country,
          city: draft.city.trim(),
          ...(draft.district.trim() ? { district: draft.district.trim() } : {}),
          ...(draft.street.trim() ? { street: draft.street.trim() } : {}),
        },
      });
      await refresh();
      if (providerId) setActive(providerId);
      setScreen({ phase: 2 });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "error.createFailed");
    }
  }, [draft, create, refresh, setActive]);

  const advance = useCallback(() => {
    if (screen.phase === 1) {
      const stepErrors = validateStep(screen.sub as ProviderSubStep, draft);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        return;
      }
      // The last sub-step is where the provider gets created; the earlier two
      // only move forward.
      if (screen.sub === "location") {
        void submit();
        return;
      }
    }
    if (screen.phase === 2) {
      // The draft has done its job once the provider exists. Leaving it behind
      // would restore a finished application into the next attempt.
      clearDraft();
    }
    const next = nextScreen(screen);
    if (next) setScreen(next);
  }, [screen, draft, submit]);

  const back = useCallback(() => {
    const target = previousScreen(screen);
    if (target) setScreen(target);
    else void navigate({ to: "/become-provider" });
  }, [screen, navigate]);

  return useMemo(
    () => ({
      screen,
      setScreen,
      draft,
      patch,
      errors,
      submitError,
      submitting: create.isPending,
      advance,
      back,
    }),
    [screen, draft, patch, errors, submitError, create.isPending, advance, back],
  );
}
