import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { ServiceStatus } from "@ntizo/shared";
import { isIndividualProvider } from "@/features/provider/availability/domain/types";
import { useAvailabilityConfig } from "@/features/provider/availability/viewmodel/use-availability";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useServices } from "./use-services";
import { useCategoryOptions, useSaveService, useSetServiceStatus } from "./use-service-editor";
import {
  canSubmit,
  draftFrom,
  emptyDraft,
  serviceDraftErrors,
  serviceLifecycle,
  type ServiceDraft,
} from "../domain/service-draft";
import { publishBlocker, sectionStates, type CompletenessInput } from "../domain/completeness";
import {
  CREATES_SERVICE,
  FIRST_STEP,
  isReachable,
  nextStep,
  previousStep,
  stepBlocks,
  stepsFor,
  type ServiceStep,
} from "../domain/wizard-model";
import type { ProviderService } from "../domain/types";

/**
 * The steps whose answers `service.update` can actually write.
 *
 * Advancing off one of these on a *saved* service persists it, which is what
 * makes the wizard usable as an editor — someone who came here to change a
 * price should not have to walk to the end for it to stick.
 *
 * `booking` is deliberately absent even though it is draft-backed:
 * `service.update` carries no `bookingMode` field, so a save here would be a
 * round trip that writes nothing. `pricing` and `languages` are absent
 * because they never touch the draft at all — the options editor and the
 * translation boxes each own their own mutation and have already written by
 * the time Continue is pressed.
 */
const SAVES_ON_ADVANCE: ReadonlySet<ServiceStep> = new Set(["basics", "performers"]);

/**
 * The service wizard's state, and the one place that decides when to talk to
 * the server.
 *
 * Three behaviours are carried over from `service-editor-page.tsx`, which this
 * replaces. They are the ones that were bugs first and fixes second, so they
 * are spelled out rather than left to be rediscovered:
 *
 * 1. **Live status.** `published` reads `current?.status` from the services
 *    list's own cache — shared with the list this page is reached from — and
 *    never a value captured at mount. Capturing it once left the performer
 *    requirement disengaged for the rest of a session after a same-session
 *    publish.
 * 2. **The late-resolving creator.** `useAvailabilityConfig` is started
 *    unconditionally, and a *separate* effect backfills the creating member
 *    into `memberIds` if it resolves after the draft has already been seeded.
 *    The seed deliberately does not wait for it.
 * 3. **`new` → real id is not a new service.** The first save replaces
 *    `/services/new` with `/services/<id>`, which changes the route param and
 *    would otherwise re-fire the step reset and throw a provider back to step
 *    one with everything saved and nothing said.
 */
export function useServiceWizard() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();
  const { serviceId } = useParams({ strict: false }) as { serviceId: string };
  const isNew = serviceId === "new";

  const { activeProvider } = useActiveProvider();
  const providerId = activeProvider?.id ?? "";
  const categories = useCategoryOptions();
  const save = useSaveService(providerId);
  const setStatus = useSetServiceStatus(providerId);
  // Shares its cache with the list this page is reached from, so an option
  // added here shows up there immediately, and so this page can read a freshly
  // created service back without a query of its own.
  const servicesQuery = useServices(activeProvider?.id);
  // Started unconditionally, not gated on `isNew`, so it has usually resolved
  // by the time a provider gets here.
  const availabilityQuery = useAvailabilityConfig(activeProvider?.id);
  const currentUser = useCurrentUser();

  const [draft, setDraft] = useState<ServiceDraft>(() => emptyDraft());
  const [step, setStep] = useState<ServiceStep>(FIRST_STEP);
  const [locationChoice, setLocationChoice] = useState<"remote" | "in_person" | "">("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  // Kept apart from `errorCode` on purpose: `SERVICE_NEEDS_MEMBER` and
  // `MEMBER_NOT_IN_PROVIDER` are about one field, not the save as a whole.
  const [memberErrorCode, setMemberErrorCode] = useState<string | null>(null);
  // Whether this step's own refusal should be showing yet. False until
  // Continue is actually pressed — an error beside a field nobody has filled
  // in reads as a complaint about not having started.
  const [showStepError, setShowStepError] = useState(false);

  const availability = availabilityQuery.data;
  // One member means the performers question has one answer and asking it is
  // noise. Defaults to `true` (step hidden) while the config loads, so the
  // rail never flashes a step that is about to disappear.
  const individualProvider = availability ? isIndividualProvider(availability) : true;
  const currentUserId = currentUser.data?.id ?? null;
  const creatorMemberId =
    availability && currentUserId
      ? (availability.members.find((m) => m.userId === currentUserId)?.memberId ?? null)
      : null;

  const current: ProviderService | null = isNew
    ? null
    : (servicesQuery.data?.find((s) => s.id === serviceId) ?? null);

  // Guards the seed effect so it runs once per `serviceId` the route carries,
  // not on every render — a ref rather than state so setting it never itself
  // re-fires the effect that just set it.
  const seededForRef = useRef<string | null>(null);

  useEffect(() => {
    if (seededForRef.current === serviceId) return;
    if (isNew) {
      setDraft({
        ...emptyDraft(creatorMemberId ?? undefined),
        sourceLocale: locale as ServiceDraft["sourceLocale"],
      });
      setLocationChoice("");
      seededForRef.current = serviceId;
      return;
    }
    const found = servicesQuery.data?.find((s) => s.id === serviceId);
    // Waits for the list to actually contain it, so a deep link landing before
    // that query resolves does not seed from an empty draft and stick there.
    if (!found) return;
    const seeded = draftFrom(found);
    setDraft(seeded);
    setLocationChoice(seeded.locationType === "remote" ? "remote" : "in_person");
    seededForRef.current = serviceId;
  }, [serviceId, isNew, servicesQuery.data, creatorMemberId, locale]);

  // Resets the step when the route names a *different* service. The
  // `new` → real-id move is the same service, just saved, and resetting there
  // is the bug described in this hook's doc comment.
  const stepResetForRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = stepResetForRef.current;
    stepResetForRef.current = serviceId;
    if (previous === "new" || previous === null) return;
    setStep(FIRST_STEP);
    setShowStepError(false);
  }, [serviceId]);

  // Backfills the creating member once `useAvailabilityConfig` resolves after
  // the seed above has already run on a brand-new, untouched draft. Only while
  // still on `new` — after a save, `memberIds` is a real answer this must not
  // silently rewrite.
  useEffect(() => {
    if (!isNew || !creatorMemberId) return;
    setDraft((d) => (d.memberIds.length === 0 ? { ...d, memberIds: [creatorMemberId] } : d));
  }, [isNew, creatorMemberId]);

  const saved = !isNew;
  const published = current?.status === "published";
  // Memoised because `persist` closes over it: a fresh object each render
  // would give that callback a new identity every time, and every consumer of
  // it a reason to re-render.
  const draftCtx = useMemo(
    () => ({ individualProvider, published }),
    [individualProvider, published],
  );
  const fieldErrors = serviceDraftErrors(draft, draftCtx);
  const lifecycle = serviceLifecycle({
    serviceId: isNew ? null : serviceId,
    bookingMode: draft.bookingMode,
  });

  const steps = useMemo(
    () => stepsFor({ individualProvider, bookingMode: draft.bookingMode }),
    [individualProvider, draft.bookingMode],
  );

  const completenessInput: CompletenessInput = {
    categoryId: draft.categoryId || null,
    sourceName: draft.name.trim(),
    bookingMode: draft.bookingMode,
    optionCount: current?.options.length ?? 0,
    memberIds: draft.memberIds,
    individualProvider,
  };
  const blocker = publishBlocker(completenessInput);
  const blockerStep =
    (sectionStates(completenessInput).find((s) => s.blockingCode === blocker)?.id as
      | ServiceStep
      | undefined) ?? null;

  /** Writes the draft. Resolves to the service's id, or null if it did not write. */
  const persist = useCallback(async (): Promise<string | null> => {
    if (!activeProvider) return null;
    if (!canSubmit(draft, draftCtx) || draft.locationType === "") return null;
    const locationType = draft.locationType;
    setErrorCode(null);
    setMemberErrorCode(null);
    try {
      const id = await save.mutateAsync({
        ...(lifecycle.isSaved ? { serviceId } : {}),
        providerId: activeProvider.id,
        categoryId: draft.categoryId,
        sourceLocale: draft.sourceLocale,
        locationType,
        bookingMode: draft.bookingMode,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        memberIds: draft.memberIds,
        skipMembers: individualProvider,
      });
      if (!lifecycle.isSaved) {
        // The draft already holds exactly what was written — nothing for the
        // seed effect to add once the route's `serviceId` becomes this id.
        seededForRef.current = id;
        void navigate({
          to: "/provider/$slug/services/$serviceId",
          params: { slug: activeProvider.slug, serviceId: id },
          replace: true,
        });
      }
      return id;
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e as Error).message;
      if (code === "SERVICE_NEEDS_MEMBER" || code === "MEMBER_NOT_IN_PROVIDER") {
        setMemberErrorCode(code);
      } else {
        setErrorCode(code);
      }
      return null;
    }
  }, [activeProvider, draft, draftCtx, individualProvider, lifecycle.isSaved, navigate, save, serviceId]);

  const goToList = useCallback(() => {
    if (!activeProvider) return;
    void navigate({
      to: "/provider/$slug/services",
      params: { slug: activeProvider.slug },
    });
  }, [activeProvider, navigate]);

  const advance = useCallback(async () => {
    if (stepBlocks(step, draft)) {
      setShowStepError(true);
      return;
    }
    setShowStepError(false);
    const needsSave = saved ? SAVES_ON_ADVANCE.has(step) : step === CREATES_SERVICE;
    if (needsSave && (await persist()) === null) return;
    const next = nextStep(step, steps);
    if (next) setStep(next);
  }, [draft, persist, saved, step, steps]);

  const back = useCallback(() => {
    const target = previousStep(step, steps);
    if (target) {
      setShowStepError(false);
      setStep(target);
    } else {
      goToList();
    }
  }, [goToList, step, steps]);

  const seek = useCallback(
    (target: ServiceStep) => {
      if (!isReachable(target, step, { saved }, steps)) return;
      setShowStepError(false);
      setStep(target);
    },
    [saved, step, steps],
  );

  const saveAndExit = useCallback(async () => {
    if (stepBlocks(step, draft)) {
      setShowStepError(true);
      return;
    }
    if (SAVES_ON_ADVANCE.has(step) && (await persist()) === null) return;
    goToList();
  }, [draft, goToList, persist, step]);

  const changeStatus = useCallback(
    async (status: ServiceStatus) => {
      if (!lifecycle.isSaved) return;
      setErrorCode(null);
      try {
        await setStatus.mutateAsync({ serviceId, status });
      } catch (e) {
        setErrorCode((e as { code?: string }).code ?? (e as Error).message);
      }
    },
    [lifecycle.isSaved, serviceId, setStatus],
  );

  return {
    provider: activeProvider,
    serviceId: isNew ? null : serviceId,
    current,
    saved,
    steps,
    step,
    draft,
    setDraft,
    locationChoice,
    setLocationChoice,
    categories,
    members: availability?.members ?? [],
    individualProvider,
    canChangeBookingMode: lifecycle.canChangeBookingMode,
    canPublish: activeProvider?.role === "owner" || activeProvider?.role === "admin",
    fieldErrors,
    showStepError,
    errorCode,
    memberErrorCode,
    clearMemberError: () => setMemberErrorCode(null),
    blocker,
    blockerStep,
    saving: save.isPending,
    statusChanging: setStatus.isPending,
    isReachable: (target: ServiceStep, from: ServiceStep) =>
      isReachable(target, from, { saved }, steps),
    advance,
    back,
    seek,
    saveAndExit,
    changeStatus,
  };
}
