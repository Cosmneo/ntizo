import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, X } from "lucide-react";
import { Badge, Button, Checkbox, Input, Select, Sheet, SheetContent, cn } from "@ntizo/frontend-ui";
import type { ServiceStatus } from "@ntizo/shared";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { isIndividualProvider } from "@/features/provider/availability/domain/types";
import { useAvailabilityConfig } from "@/features/provider/availability/viewmodel/use-availability";
import { useServices } from "../viewmodel/use-services";
import { useCategoryOptions, useSaveService, useSetServiceStatus } from "../viewmodel/use-service-editor";
import { OptionsEditor } from "./options-editor";
import { TranslationsSheet } from "./translations-sheet";
import {
  canSubmit,
  draftFrom,
  emptyDraft,
  IN_PERSON_LOCATION_TYPES,
  parseBufferMinutes,
  serviceDraftErrors,
  serviceLifecycle,
  SLOT_INTERVAL_OPTIONS,
  type ServiceDraft,
  type SlotIntervalMinutes,
} from "../domain/service-draft";
import { STATUS_TONE, type ProviderService } from "../domain/types";

/**
 * Creating and editing a service, in the same right-hand sheet the category
 * form uses.
 *
 * A short form, not a wizard — a service is a small thing, and asking for it
 * in seven steps would make it feel like registering a business again.
 * Saving is what turns a draft into a real service: the options editor and
 * the publish control both need a `serviceId` that only exists on the
 * server, so they stay disabled-with-an-explanation until the first save has
 * happened, rather than pretending to be part of a wizard's next step.
 */
export function ServiceFormSheet({
  open,
  onOpenChange,
  editing,
  providerId,
  canPublish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates. */
  editing: ProviderService | null;
  providerId: string;
  /**
   * Whether the active workspace role may publish, unpublish or archive.
   * Owner and admin only — staff can still create, price and translate a
   * service through the rest of this form, just not decide whether it's
   * live. The server enforces this too; hiding the controls here only keeps
   * staff from being offered a button that refuses them.
   */
  canPublish: boolean;
}) {
  const { t, i18n } = useTranslation("provider");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const categories = useCategoryOptions();
  const save = useSaveService(providerId);
  const setStatus = useSetServiceStatus(providerId);
  // Shares its cache with the list this sheet is opened from, so an option
  // added here shows up there the moment the sheet closes, and so this sheet
  // can read the freshly created service back without a query of its own.
  const servicesQuery = useServices(providerId);
  // Backs the "who does this" checkbox list — the same query and domain
  // predicate the availability screen already built (see that feature's
  // `domain/types.ts`), not a second copy of either. Started unconditionally
  // (not gated on `open`) so it has usually already resolved by the time a
  // provider opens this sheet.
  const availabilityQuery = useAvailabilityConfig(providerId);
  const currentUser = useCurrentUser();

  const [draft, setDraft] = useState<ServiceDraft>(emptyDraft);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept apart from `error` (the top banner) on purpose: `SERVICE_NEEDS_MEMBER`
  // and `MEMBER_NOT_IN_PROVIDER` are about one specific field, not the save
  // as a whole, and the design calls for the refusal to appear under that
  // field rather than as a generic "something went wrong".
  const [memberError, setMemberError] = useState<string | null>(null);
  const [translationsOpen, setTranslationsOpen] = useState(false);
  // Which of the two top-level answers is showing, tracked apart from
  // `draft.locationType`: that field alone cannot tell "never answered"
  // apart from "answered 'in person', hasn't picked which one yet" — both
  // are `locationType === ""`. Without this, the second question would have
  // to show whenever the value merely isn't "remote", which is also true of
  // the unanswered state, and both steps would appear before either had been
  // picked.
  const [locationChoice, setLocationChoice] = useState<"remote" | "in_person" | "">("");

  const availability = availabilityQuery.data;
  // One member means the question has one answer and asking it is noise —
  // the same predicate and the same one-member read `AvailabilityPage`
  // already uses for its own person picker. Defaults to `true` (hidden)
  // while the config is still loading, so the checkbox list never flashes
  // briefly empty before its first real answer arrives.
  const individualProvider = availability ? isIndividualProvider(availability) : true;
  const currentUserId = currentUser.data?.id ?? null;
  const creatorMemberId =
    availability && currentUserId
      ? (availability.members.find((m) => m.userId === currentUserId)?.memberId ?? null)
      : null;

  // Reset every time the sheet opens, so yesterday's half-typed service does
  // not appear inside today's, the same rule the category form follows.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const d = draftFrom(editing);
      setDraft(d);
      setServiceId(editing.id);
      setLocationChoice(d.locationType === "remote" ? "remote" : "in_person");
    } else {
      // The language the provider is writing in defaults to whatever they are
      // reading the console in — not the platform default, which for someone
      // working in French would silently start the service in Portuguese.
      // `creatorMemberId` pre-ticks whoever is opening this sheet, mirroring
      // what the server does anyway the moment the service is created — see
      // the backfill effect below for the case where this query hasn't
      // resolved yet at the moment this one runs.
      setDraft({
        ...emptyDraft(creatorMemberId ?? undefined),
        sourceLocale: locale as ServiceDraft["sourceLocale"],
      });
      setServiceId(null);
      setLocationChoice("");
    }
    setError(null);
    setMemberError(null);
    // Closed alongside the form it lives behind — reopening the form to a
    // different service must not leave last time's translations sheet open
    // over it.
    setTranslationsOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  // Backfills the creating member once `useAvailabilityConfig` resolves
  // after this sheet has already opened on a brand-new, still-untouched
  // draft. The effect above runs once per `open`/`editing` change and can
  // fire before that query — started the moment this component mounts, not
  // gated on `open` — has its first answer; without this, opening the sheet
  // quickly enough would leave `memberIds` empty even though the creator is
  // known moments later.
  useEffect(() => {
    if (!open || editing || serviceId || !creatorMemberId) return;
    setDraft((d) => (d.memberIds.length === 0 ? { ...d, memberIds: [creatorMemberId] } : d));
  }, [open, editing, serviceId, creatorMemberId]);

  const current = serviceId
    ? (servicesQuery.data?.find((s) => s.id === serviceId) ?? null)
    : null;

  // The one signal for "has this been saved" — see the doc comment on
  // `serviceLifecycle`. Everything below that depends on that question reads
  // this, not `editing` (which only ever reflects how the sheet was opened,
  // not whether a same-session save has since happened) and not `serviceId`
  // directly (so there is one place, not several, that could drift).
  const lifecycle = serviceLifecycle({ serviceId, bookingMode: draft.bookingMode });

  // `current?.status`, the *live* status from the services list this sheet
  // shares its cache with — not `editing?.status`, which is only ever what
  // the sheet happened to open with. A version of this that read `editing`
  // would leave the performer requirement disengaged for the rest of the
  // same session right after a same-session publish, the exact class of bug
  // `serviceLifecycle`'s own doc comment already warns about for
  // `canChangeBookingMode`.
  const published = current?.status === "published";
  const draftCtx = { individualProvider, published };
  const fieldErrors = serviceDraftErrors(draft, draftCtx);
  const membersErrorMessage = fieldErrors.memberIds
    ? t(`serviceError.${fieldErrors.memberIds}`)
    : (memberError ?? undefined);

  const ready = canSubmit(draft, draftCtx) && !save.isPending;

  async function submit() {
    if (!canSubmit(draft, draftCtx) || draft.locationType === "") return;
    const locationType = draft.locationType;
    setError(null);
    setMemberError(null);
    try {
      const id = await save.mutateAsync({
        // `bookingMode` is only read on the create path (see `useSaveService`)
        // and `providerId` only ever matters there too — sent every time
        // regardless, since a single shape is one call site instead of two
        // that could drift.
        ...(serviceId ? { serviceId } : {}),
        providerId,
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
      setServiceId(id);
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
    if (!serviceId) return;
    setError(null);
    try {
      await setStatus.mutateAsync({ serviceId, status });
    } catch (e) {
      setError(serverErrorMessage(e, t));
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full max-w-lg flex-col">
          <div className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
            <h2 className="type-h3 font-semibold">
              {lifecycle.isSaved ? t("serviceEdit") : t("serviceNew")}
            </h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t("close")}
              className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid flex-1 content-start gap-6 overflow-y-auto p-5">
            {error && (
              <p className="type-body text-[var(--color-destructive)]">{error}</p>
            )}

            {current && (
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge tone={STATUS_TONE[current.status]}>
                  {t(`servicesStatus.${current.status}`)}
                </Badge>
                {/* Owner/admin only — a control offered and then refused by
                    the server is worse than one never shown. Staff still see
                    the status badge above; they just don't get the buttons
                    that would change it. */}
                {canPublish && current.status === "draft" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={setStatus.isPending}
                    onClick={() => void changeStatus("published")}
                  >
                    {t("servicePublish")}
                  </Button>
                )}
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
                {/* Behind its own button, never a field in this form — the
                    main form only ever carries the source language. */}
                <Button type="button" size="sm" variant="outline" onClick={() => setTranslationsOpen(true)}>
                  {t("serviceTranslate")}
                </Button>
              </div>
            )}

            <Field label={t("serviceCategory")}>
              <Select
                id="service-category"
                value={draft.categoryId}
                onChange={(v) => setDraft((d) => ({ ...d, categoryId: v }))}
                options={categories.options}
                placeholder={t(
                  categories.loading ? "serviceCategoryLoading" : "serviceCategoryPlaceholder",
                )}
                disabled={categories.loading}
                ariaLabel={t("serviceCategory")}
                searchPlaceholder={t("serviceCategorySearchPlaceholder")}
                noResultsText={t("serviceCategoryNoResults")}
              />
            </Field>

            <Field label={t("serviceName")}>
              <Input
                id="service-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder={t("serviceNamePlaceholder")}
              />
            </Field>

            <Field label={t("serviceDescription")} hint={t("serviceDescriptionHint")}>
              <textarea
                id="service-description"
                rows={3}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                className="type-body rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
              />
            </Field>

            {/* Asked in two steps and stored as one value: "in person" is the
                umbrella over three of the four `locationType`s, not a peer of
                them, so it never becomes a value of its own. The second step
                only appears once "in person" has actually been chosen — not
                merely whenever the value isn't "remote", which is also true of
                the unanswered state and would show both steps at once before
                either has been picked. */}
            <Choice
              label={t("serviceLocationQuestion")}
              value={locationChoice}
              onChange={(choice) => {
                setLocationChoice(choice);
                if (choice === "remote") setDraft((d) => ({ ...d, locationType: "remote" }));
                else setDraft((d) => ({ ...d, locationType: "" }));
              }}
              options={[
                { value: "remote", label: t("serviceLocationRemote") },
                { value: "in_person", label: t("serviceLocationInPerson") },
              ]}
            />

            {locationChoice === "in_person" && (
              <Choice
                label={t("serviceWhereQuestion")}
                value={draft.locationType}
                onChange={(v) => setDraft((d) => ({ ...d, locationType: v }))}
                options={IN_PERSON_LOCATION_TYPES.map((v) => ({
                  value: v,
                  label: t(`serviceLocationType.${v}`),
                }))}
              />
            )}

            {/* Hidden entirely for an individual provider: one member means
                the question has one answer, and asking it is noise. The
                workspace's member list comes from `availability.config`, the
                same query and the same `AvailabilityMember` shape the
                availability screen already uses — not a second copy of
                either. */}
            {!individualProvider && (
              <Field
                label={t("serviceMembersQuestion")}
                hint={t("serviceMembersHint")}
                error={membersErrorMessage}
              >
                <div className="grid gap-2">
                  {(availability?.members ?? []).map((member) => (
                    <label key={member.memberId} className="flex items-center gap-2.5">
                      <Checkbox
                        checked={draft.memberIds.includes(member.memberId)}
                        onChange={(e) => {
                          setMemberError(null);
                          setDraft((d) => ({
                            ...d,
                            memberIds: e.target.checked
                              ? [...d.memberIds, member.memberId]
                              : d.memberIds.filter((id) => id !== member.memberId),
                          }));
                        }}
                      />
                      <span className="type-body">{member.name ?? member.userId}</span>
                    </label>
                  ))}
                </div>
              </Field>
            )}

            <Field
              label={t("serviceBuffer")}
              hint={fieldErrors.bufferMinutes ? undefined : t("serviceBufferHint")}
              error={fieldErrors.bufferMinutes ? t("serviceBufferError") : undefined}
            >
              <Input
                id="service-buffer"
                inputMode="numeric"
                // `0` renders as an empty box, not the digit "0" — the
                // buffer's own default is a real, legitimate zero, but
                // showing it as literal "0" would make an untouched field
                // indistinguishable from one the person had to clear first.
                // See `parseBufferMinutes`'s own doc comment for the other
                // half of this: typing never produces `NaN`, so this input
                // never round-trips that text back onto itself either.
                value={draft.bufferMinutes === 0 ? "" : String(draft.bufferMinutes)}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, bufferMinutes: parseBufferMinutes(e.target.value) }))
                }
                placeholder="0"
              />
            </Field>

            <Field label={t("serviceSlotInterval")} hint={t("serviceSlotIntervalHint")}>
              <Select
                id="service-slot-interval"
                value={String(draft.slotIntervalMinutes)}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, slotIntervalMinutes: Number(v) as SlotIntervalMinutes }))
                }
                options={SLOT_INTERVAL_OPTIONS.map((n) => ({
                  value: String(n),
                  label: t(`serviceSlotInterval${n}`),
                }))}
                ariaLabel={t("serviceSlotInterval")}
              />
            </Field>

            {/* Fixed at creation: `service.update` has no field for it, because
                changing it out from under a service that already has priced
                options (or a quote form) would leave one of the two in a shape
                the other invariant refuses. */}
            <Choice
              label={t("serviceBookingModeQuestion")}
              hint={t(
                draft.bookingMode === "priced"
                  ? "serviceBookingModeHint"
                  : "serviceBookingModeQuoteHint",
              )}
              value={draft.bookingMode}
              onChange={(v) => setDraft((d) => ({ ...d, bookingMode: v }))}
              options={[
                { value: "priced", label: t("serviceBookingMode.priced") },
                { value: "quote", label: t("serviceBookingMode.quote") },
              ]}
              disabled={!lifecycle.canChangeBookingMode}
              disabledHint={!lifecycle.canChangeBookingMode ? t("serviceBookingModeLocked") : undefined}
            />

            {draft.bookingMode === "priced" &&
              (lifecycle.showOptionsEditor && serviceId ? (
                <OptionsEditor
                  providerId={providerId}
                  serviceId={serviceId}
                  sourceLocale={draft.sourceLocale}
                  options={current?.options ?? []}
                />
              ) : (
                <p className="type-body rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] px-3.5 py-2.5 text-[var(--color-muted-foreground)]">
                  {t("serviceOptionsSaveFirst")}
                </p>
              ))}

            {draft.bookingMode === "quote" && (
              <p className="type-body rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] px-3.5 py-2.5 text-[var(--color-muted-foreground)]">
                {t("serviceOptionsQuoteNote")}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("close")}
            </Button>
            <Button type="button" disabled={!ready} onClick={() => void submit()}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {serviceId ? t("serviceSaveExisting") : t("serviceSaveNew")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* A sibling of the form's own sheet, not nested inside its
          `SheetContent` — that panel unmounts the moment the form closes
          (`if (!ctx.open) return null`), and this one needs to survive that
          for exactly as long as `translationsOpen` says it should. Rendered
          after the form's sheet in the tree so it paints on top when both are
          open, the same way a dialog opened from within another one does. */}
      {current && (
        <TranslationsSheet
          open={translationsOpen}
          onOpenChange={setTranslationsOpen}
          service={current}
          providerId={providerId}
        />
      )}
    </>
  );
}

/** The server's code, not its English sentence — the message belongs in the reader's language. */
function serverErrorMessage(e: unknown, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const code = (e as { code?: string }).code ?? (e as Error).message;
  return t(`serviceError.${code}`, { defaultValue: t("serviceSaveFailed") });
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  /** Takes over the hint's spot when present — the same priority `OptionField` gives an option's own field errors. */
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
        {label}
      </span>
      {children}
      {error ? (
        <span className="type-caption text-[var(--color-destructive)]">{error}</span>
      ) : hint && (
        <span className="type-caption text-[var(--color-muted-foreground)]">
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * A small pill-button radiogroup for a handful of mutually exclusive
 * choices — the same `role="radiogroup"`/`role="radio"` pattern the
 * onboarding wizard uses for provider type and payout method, sized for a
 * field inside a side sheet rather than a full-screen step.
 */
function Choice<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
  disabled,
  disabledHint,
}: {
  label: string;
  hint?: string;
  value: T | "";
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <Field label={label} hint={disabled ? disabledHint : hint}>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={cn(
                "type-body rounded-full border px-4 py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-60",
                selected
                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] font-semibold text-[var(--color-primary)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}
