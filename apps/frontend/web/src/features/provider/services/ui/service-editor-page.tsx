import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  Badge,
  Button,
  ProgressRing,
  SectionRail,
  StickyActionBar,
  type RailSection,
} from "@ntizo/frontend-ui";
import type { ServiceStatus } from "@ntizo/shared";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { isIndividualProvider } from "@/features/provider/availability/domain/types";
import { useAvailabilityConfig } from "@/features/provider/availability/viewmodel/use-availability";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { useServices } from "../viewmodel/use-services";
import { useCategoryOptions, useSaveService, useSetServiceStatus } from "../viewmodel/use-service-editor";
import {
  canSubmit,
  draftFrom,
  emptyDraft,
  serviceDraftErrors,
  serviceLifecycle,
  type ServiceDraft,
} from "../domain/service-draft";
import {
  sectionStates,
  publishBlocker,
  requiredProgress,
  type CompletenessInput,
  type SectionId,
} from "../domain/completeness";
import { STATUS_TONE, type ProviderService } from "../domain/types";
import { BasicsSection } from "./sections/basics-section";
import { PricingSection } from "./sections/pricing-section";
import { PerformersSection } from "./sections/performers-section";

/**
 * Creating and editing a service, as a full page with a section rail.
 *
 * Replaces `service-form.tsx`'s 595-line sheet (still present, still wired
 * up from nowhere as of this task — `services-page.tsx` now routes here
 * instead of opening it, and Task 6 deletes the sheet outright once the
 * remaining sections exist). Three behaviours moved across unchanged:
 *
 * 1. **Live status.** `published` reads `current?.status` from the services
 *    list's own cache (`useServices`, keyed by provider, shared with the
 *    list this page is reached from) — never a value captured at mount. A
 *    version that captured status once would leave the performer
 *    requirement disengaged for the rest of a session after a same-session
 *    publish, exactly the bug `service-form.tsx`'s own comments describe.
 * 2. **The late-resolving creator.** `useAvailabilityConfig` is started
 *    unconditionally (not gated on anything) and a *second*, separate effect
 *    backfills the creating member into `memberIds` if that query resolves
 *    after the initial draft has already been seeded — the initial seed
 *    effect deliberately does not wait for it.
 * 3. **The two-step location question.** `locationChoice` is tracked apart
 *    from `draft.locationType`, because "never answered" and "answered 'in
 *    person', hasn't picked which one yet" are both `locationType === ""`.
 *
 * The route is canonical for "has this been saved", not local state: a
 * brand-new service lives at `.../services/new`; the first successful save
 * replaces that with the real id via `navigate(..., { replace: true })`, and
 * from then on `serviceId` from the URL *is* the saved service's id. This is
 * the same "URL is the state" rule `useActiveProvider` already follows for
 * which workspace is open.
 */
export function ServiceEditorPage() {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();
  const { serviceId } = useParams({ strict: false }) as { serviceId: string };
  const isNew = serviceId === "new";

  const { activeProvider } = useActiveProvider();
  const categories = useCategoryOptions();
  const save = useSaveService(activeProvider?.id ?? "");
  const setStatus = useSetServiceStatus(activeProvider?.id ?? "");
  // Shares its cache with the list this page is reached from, so an option
  // added here shows up there immediately, and so this page can read a
  // freshly created service back without a query of its own.
  const servicesQuery = useServices(activeProvider?.id);
  // Backs the performers checkbox list — the same query and domain predicate
  // the availability screen already built. Started unconditionally (not
  // gated on `isNew`) so it has usually already resolved by the time a
  // provider reaches this page.
  const availabilityQuery = useAvailabilityConfig(activeProvider?.id);
  const currentUser = useCurrentUser();

  const [draft, setDraft] = useState<ServiceDraft>(() => emptyDraft());
  const [currentSectionId, setCurrentSectionId] = useState<SectionId>("basics");
  const [error, setError] = useState<string | null>(null);
  // Kept apart from `error` (the top banner) on purpose: `SERVICE_NEEDS_MEMBER`
  // and `MEMBER_NOT_IN_PROVIDER` are about one specific field, not the save
  // as a whole — the same split `service-form.tsx` drew.
  const [memberError, setMemberError] = useState<string | null>(null);
  const [locationChoice, setLocationChoice] = useState<"remote" | "in_person" | "">("");

  // Guards the seed effect below so it runs once per `serviceId` the route
  // carries, not on every render — a `ref` rather than a second state
  // variable so updating it never itself triggers a re-render or re-fires
  // the effect that just set it.
  const seededForRef = useRef<string | null>(null);

  const availability = availabilityQuery.data;
  // One member means the question has one answer and asking it is noise.
  // Defaults to `true` (hidden) while the config is still loading, so the
  // checkbox list never flashes briefly empty before its first real answer.
  const individualProvider = availability ? isIndividualProvider(availability) : true;
  const currentUserId = currentUser.data?.id ?? null;
  const creatorMemberId =
    availability && currentUserId
      ? (availability.members.find((m) => m.userId === currentUserId)?.memberId ?? null)
      : null;

  // Seeds the draft once per `serviceId` the route names. For `new`, seeds
  // immediately (does not wait on `creatorMemberId` — see the backfill
  // effect below for that). For an existing id, waits for the services list
  // to actually contain it, so a deep link that lands before that query
  // resolves does not seed from an empty draft and stick there.
  useEffect(() => {
    if (seededForRef.current === serviceId) return;
    if (isNew) {
      setDraft({ ...emptyDraft(creatorMemberId ?? undefined), sourceLocale: locale as ServiceDraft["sourceLocale"] });
      setLocationChoice("");
      seededForRef.current = serviceId;
      return;
    }
    const found = servicesQuery.data?.find((s) => s.id === serviceId);
    if (!found) return;
    const d = draftFrom(found);
    setDraft(d);
    setLocationChoice(d.locationType === "remote" ? "remote" : "in_person");
    seededForRef.current = serviceId;
  }, [serviceId, isNew, servicesQuery.data, creatorMemberId, locale]);

  // Resets which section is showing when the route names a different
  // service — reopening the editor on another row should not land on
  // whichever section was last open for the previous one.
  useEffect(() => {
    setCurrentSectionId("basics");
  }, [serviceId]);

  // Backfills the creating member once `useAvailabilityConfig` resolves
  // after the seed effect above has already run on a brand-new,
  // still-untouched draft. Only while still on `new` — once a save has
  // happened, `memberIds` is a real, provider-set answer this must not
  // silently rewrite.
  useEffect(() => {
    if (!isNew || !creatorMemberId) return;
    setDraft((d) => (d.memberIds.length === 0 ? { ...d, memberIds: [creatorMemberId] } : d));
  }, [isNew, creatorMemberId]);

  if (!activeProvider) return null;
  // Rebound to a variable TypeScript can prove stays non-null inside the
  // closures below (`handleSave`, `changeStatus`) — narrowing from the guard
  // above does not reach into a nested function declaration.
  const provider = activeProvider;

  const current: ProviderService | null = isNew
    ? null
    : (servicesQuery.data?.find((s) => s.id === serviceId) ?? null);

  // The *live* status from the services list's own cache — not a value
  // captured when this page was opened. See the file doc comment's point 1.
  const published = current?.status === "published";
  const draftCtx = { individualProvider, published };
  const fieldErrors = serviceDraftErrors(draft, draftCtx);
  const membersErrorMessage = fieldErrors.memberIds
    ? t(`serviceError.${fieldErrors.memberIds}`)
    : (memberError ?? undefined);

  const lifecycle = serviceLifecycle({ serviceId: isNew ? null : serviceId, bookingMode: draft.bookingMode });
  const readyToSave = canSubmit(draft, draftCtx) && !save.isPending;

  const canPublish = provider.role === "owner" || provider.role === "admin";

  const completenessInput: CompletenessInput = {
    categoryId: draft.categoryId || null,
    sourceName: draft.name.trim(),
    bookingMode: draft.bookingMode,
    optionCount: current?.options.length ?? 0,
    memberIds: draft.memberIds,
    individualProvider,
  };
  const states = sectionStates(completenessInput);
  const progress = requiredProgress(states);
  const blocker = publishBlocker(completenessInput);
  const blockerSectionId = states.find((s) => s.blockingCode === blocker)?.id;

  const railSections: RailSection[] = states.map((s) => ({
    id: s.id,
    label: t(`serviceSection.${s.id}`),
    status: s.id === "performers" && memberError ? "error" : s.complete ? "done" : "todo",
    required: s.required,
  }));

  async function handleSave() {
    if (!canSubmit(draft, draftCtx) || draft.locationType === "") return;
    const locationType = draft.locationType;
    setError(null);
    setMemberError(null);
    try {
      const id = await save.mutateAsync({
        ...(lifecycle.isSaved ? { serviceId } : {}),
        providerId: provider.id,
        categoryId: draft.categoryId,
        sourceLocale: draft.sourceLocale,
        locationType,
        bookingMode: draft.bookingMode,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        bufferMinutes: draft.bufferMinutes,
        slotIntervalMinutes: draft.slotIntervalMinutes,
        memberIds: draft.memberIds,
        skipMembers: individualProvider,
      });
      if (!lifecycle.isSaved) {
        // The draft already holds exactly what was just written — nothing
        // for the seed effect to add once the route's `serviceId` becomes
        // this real id and the services list refetches it.
        seededForRef.current = id;
        void navigate({
          to: "/provider/$slug/services/$serviceId",
          params: { slug: provider.slug, serviceId: id },
          replace: true,
        });
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "SERVICE_NEEDS_MEMBER" || code === "MEMBER_NOT_IN_PROVIDER") {
        setMemberError(serverErrorMessage(e, t));
      } else {
        setError(serverErrorMessage(e, t));
      }
    }
  }

  async function changeStatus(status: ServiceStatus) {
    if (!lifecycle.isSaved) return;
    setError(null);
    try {
      await setStatus.mutateAsync({ serviceId, status });
    } catch (e) {
      setError(serverErrorMessage(e, t));
    }
  }

  function renderSection() {
    switch (currentSectionId) {
      case "basics":
        return (
          <BasicsSection
            draft={draft}
            setDraft={setDraft}
            categories={categories}
            locationChoice={locationChoice}
            onLocationChoiceChange={setLocationChoice}
          />
        );
      case "pricing":
        return (
          <PricingSection
            draft={draft}
            setDraft={setDraft}
            providerId={provider.id}
            serviceId={isNew ? null : serviceId}
            options={current?.options ?? []}
            canChangeBookingMode={lifecycle.canChangeBookingMode}
            showOptionsEditor={lifecycle.showOptionsEditor}
          />
        );
      case "performers":
        return individualProvider ? null : (
          <PerformersSection
            draft={draft}
            setDraft={setDraft}
            members={availability?.members ?? []}
            error={membersErrorMessage}
            onErrorClear={() => setMemberError(null)}
          />
        );
      default:
        // Timing, languages and media — built in a later task. Listed in the
        // rail (they come straight from `sectionStates`) but hold nothing
        // yet.
        return <p className="type-body text-[var(--color-muted-foreground)]">{t("comingSoon")}</p>;
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Link
        to="/provider/$slug/services"
        params={{ slug: provider.slug }}
        className="type-body inline-flex items-center gap-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("servicesTitle")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-h2 font-semibold">
          {lifecycle.isSaved ? t("serviceEdit") : t("serviceNew")}
        </h1>
        {current && (
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone={STATUS_TONE[current.status]}>{t(`servicesStatus.${current.status}`)}</Badge>
            {canPublish && current.status === "published" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() => void changeStatus("draft")}
              >
                {t("serviceUnpublish")}
              </Button>
            )}
            {canPublish && current.status !== "archived" && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={setStatus.isPending}
                onClick={() => void changeStatus("archived")}
              >
                {t("serviceArchive")}
              </Button>
            )}
          </div>
        )}
      </div>

      {error && <p className="type-body text-[var(--color-destructive)]">{error}</p>}

      <div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-start">
        <SectionRail
          sections={railSections}
          currentId={currentSectionId}
          onSelect={(id) => setCurrentSectionId(id as SectionId)}
          title={t("serviceRailTitle")}
          statusLabels={{
            done: t("serviceSectionStatus.done"),
            todo: t("serviceSectionStatus.todo"),
            error: t("serviceSectionStatus.error"),
            optional: t("serviceSectionStatus.optional"),
          }}
        />

        <div className="min-w-0 rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
          {renderSection()}
        </div>
      </div>

      <StickyActionBar
        lead={
          <div className="flex items-center gap-3">
            <ProgressRing
              done={progress.done}
              total={progress.total}
              label={t("serviceProgressLabel", { done: progress.done, total: progress.total })}
              size={48}
            />
            {blocker && (
              <button
                type="button"
                onClick={() => blockerSectionId && setCurrentSectionId(blockerSectionId)}
                className="type-caption text-left text-[var(--color-destructive)] hover:underline"
              >
                {t(`serviceError.${blocker}`)}
              </button>
            )}
          </div>
        }
      >
        <Button type="button" variant="outline" disabled={!readyToSave} onClick={() => void handleSave()}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {lifecycle.isSaved ? t("serviceSaveExisting") : t("serviceSaveNew")}
        </Button>
        {current && canPublish && current.status === "draft" && (
          <Button
            type="button"
            disabled={blocker !== null || setStatus.isPending}
            onClick={() => void changeStatus("published")}
          >
            {setStatus.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("servicePublish")}
          </Button>
        )}
      </StickyActionBar>
    </div>
  );
}

/** The server's code, not its English sentence — the message belongs in the reader's language. */
function serverErrorMessage(e: unknown, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const code = (e as { code?: string }).code ?? (e as Error).message;
  return t(`serviceError.${code}`, { defaultValue: t("serviceSaveFailed") });
}
