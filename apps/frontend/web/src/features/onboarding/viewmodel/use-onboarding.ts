import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ProviderType, type ProviderDocumentType } from "@ntizo/shared";
import {
  EMPTY_DRAFT,
  clearDraft,
  readDraft,
  slugFrom,
  writeDraft,
  type DocumentUpload,
  type ProviderDraft,
} from "@/features/onboarding/domain/draft";
import {
  CREATES_PROVIDER,
  FIRST_STEP,
  nextStep,
  previousStep,
  type WizardStep,
} from "@/features/onboarding/domain/screen-model";
import {
  firstIncompleteStep,
  validateStep,
  type FieldKey,
} from "@/features/onboarding/domain/validation";
import {
  useCreateProvider,
  useUpdateProvider,
} from "@/features/provider/viewmodel/use-provider-mutations";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useDocumentUpload } from "@/features/provider/viewmodel/use-document-upload";

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
  const { setActive, refresh, activeProvider } = useActiveProvider();

  const [step, setStep] = useState<WizardStep>(FIRST_STEP);
  const [uploads, setUploads] = useState<DocumentUpload[]>([]);
  const [draft, setDraft] = useState<ProviderDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  /**
   * Whether a creation is already on the wire.
   *
   * A ref and not `create.isPending`, which is the state this also drives:
   * `isPending` flips on a React state update, so two clicks inside one tick
   * both read it as false and both create a workspace. A ref changes on the
   * assignment, which is the only thing fast enough to stand between them.
   *
   * Three accounts reached production holding duplicate workspaces created
   * 1.8-3.9 seconds apart — gaps that wide because nothing on screen was
   * disabled either, so people pressed Continue again when it looked like
   * nothing had happened. `submitting` below is that half; this is the half
   * that holds even when the button does not.
   */
  const creating = useRef(false);

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
    // First, before the draft is even read: a second press must do nothing
    // at all, not redo the validation and race into the same mutation.
    if (creating.current) return;
    setSubmitError(null);
    // The whole draft, not only the current step. A restored session can be
    // complete on screen three and empty on screen one, and submitting that
    // would fail server-side with a message pointing nowhere.
    const gap = firstIncompleteStep(draft);
    if (gap) {
      setStep(gap);
      setErrors(validateStep(gap, draft));
      return;
    }

    creating.current = true;
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
          ...(draft.postalCode.trim() ? { postalCode: draft.postalCode.trim() } : {}),
        },
      });
      await refresh();
      if (providerId) setActive(providerId);
      setStep("media");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "error.createFailed");
    } finally {
      // Released on failure too. A creation that errored must be retryable —
      // latching this closed for good would turn one bad request into a
      // wizard the person can never finish.
      creating.current = false;
    }
  }, [draft, create, refresh, setActive]);

  const documentUpload = useDocumentUpload(activeProvider?.id);
  const updateProvider = useUpdateProvider(activeProvider?.id ?? "");

  const advance = useCallback(() => {
    const stepErrors = validateStep(step, draft);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    // One step creates the provider; the rest only move forward.
    if (step === CREATES_PROVIDER) {
      void submit();
      return;
    }
    // Saved on the way out of the payout step. These were collected into the
    // browser draft and thrown away — the wizard asked where to send the money
    // and no mutation accepted it, so a provider filled that screen in and the
    // platform had no idea where to pay them.
    //
    // A failure here does not block the wizard: the details can be set from
    // settings afterwards, and stopping somebody on their way to the finish
    // over a save they can redo is worse than the gap it closes.
    if (step === "payout" && activeProvider && draft.payoutType) {
      void updateProvider
        .mutateAsync({
          payoutType: draft.payoutType,
          payoutIdentifier: draft.payoutIdentifier.trim(),
        })
        .catch(() => undefined);
    }
    if (step === "documents") {
      // The draft has done its job once the provider exists. Leaving it behind
      // would restore a finished application into the next attempt.
      clearDraft();
    }
    const next = nextStep(step);
    if (next) setStep(next);
  }, [step, draft, submit]);

  const back = useCallback(() => {
    const target = previousStep(step);
    if (target) setStep(target);
    else void navigate({ to: "/become-provider" });
  }, [step, navigate]);

  /**
   * Sends a picked document, then records it.
   *
   * A real upload now, not metadata held in memory. It runs at a step that
   * comes after the one creating the provider, which it has to: the route
   * refuses anyone who is not a member of the provider they are uploading for,
   * so there is no key space to write into until the row exists.
   *
   * One entry per type in the local list, because a second upload of the same
   * document replaces it rather than queueing two — and on the server the same
   * thing happens properly: the previous row is superseded, never overwritten.
   */
  const addUpload = useCallback(
    async (type: ProviderDocumentType, file: File) => {
      const result = await documentUpload.send(type, file);
      if (!result) return;
      setUploads((current) => [
        ...current.filter((u) => u.type !== type),
        { type, fileName: file.name, size: file.size },
      ]);
    },
    [documentUpload],
  );

  const removeUpload = useCallback((type: ProviderDocumentType) => {
    setUploads((current) => current.filter((u) => u.type !== type));
  }, []);

  return useMemo(
    () => ({
      step,
      setStep,
      draft,
      patch,
      errors,
      submitError,
      submitting: create.isPending,
      uploads,
      addUpload,
      removeUpload,
      uploadingDocument: documentUpload.busy,
      documentErrorKey: documentUpload.errorKey,
      advance,
      back,
    }),
    [
      step,
      draft,
      patch,
      errors,
      submitError,
      create.isPending,
      uploads,
      addUpload,
      removeUpload,
      documentUpload.busy,
      documentUpload.errorKey,
      advance,
      back,
    ],
  );
}
