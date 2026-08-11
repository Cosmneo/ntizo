import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, X } from "lucide-react";
import { Badge, Button, Input, Select, Sheet, SheetContent, cn } from "@ntizo/frontend-ui";
import type { ServiceStatus } from "@ntizo/shared";
import { useServices } from "../viewmodel/use-services";
import { useCategoryOptions, useSaveService, useSetServiceStatus } from "../viewmodel/use-service-editor";
import { OptionsEditor } from "./options-editor";
import { TranslationsSheet } from "./translations-sheet";
import {
  canSubmit,
  draftFrom,
  emptyDraft,
  IN_PERSON_LOCATION_TYPES,
  serviceLifecycle,
  type ServiceDraft,
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates. */
  editing: ProviderService | null;
  providerId: string;
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

  const [draft, setDraft] = useState<ServiceDraft>(emptyDraft);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [translationsOpen, setTranslationsOpen] = useState(false);
  // Which of the two top-level answers is showing, tracked apart from
  // `draft.locationType`: that field alone cannot tell "never answered"
  // apart from "answered 'in person', hasn't picked which one yet" — both
  // are `locationType === ""`. Without this, the second question would have
  // to show whenever the value merely isn't "remote", which is also true of
  // the unanswered state, and both steps would appear before either had been
  // picked.
  const [locationChoice, setLocationChoice] = useState<"remote" | "in_person" | "">("");

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
      setDraft({ ...emptyDraft(), sourceLocale: locale as ServiceDraft["sourceLocale"] });
      setServiceId(null);
      setLocationChoice("");
    }
    setError(null);
    // Closed alongside the form it lives behind — reopening the form to a
    // different service must not leave last time's translations sheet open
    // over it.
    setTranslationsOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const current = serviceId
    ? (servicesQuery.data?.find((s) => s.id === serviceId) ?? null)
    : null;

  // The one signal for "has this been saved" — see the doc comment on
  // `serviceLifecycle`. Everything below that depends on that question reads
  // this, not `editing` (which only ever reflects how the sheet was opened,
  // not whether a same-session save has since happened) and not `serviceId`
  // directly (so there is one place, not several, that could drift).
  const lifecycle = serviceLifecycle({ serviceId, bookingMode: draft.bookingMode });

  const ready = canSubmit(draft) && !save.isPending;

  async function submit() {
    if (!canSubmit(draft) || draft.locationType === "") return;
    const locationType = draft.locationType;
    setError(null);
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
      });
      setServiceId(id);
    } catch (e) {
      setError(serverErrorMessage(e, t));
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
                {current.status === "draft" && (
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
                {current.status === "published" && (
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
                {current.status !== "archived" && (
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
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
        {label}
      </span>
      {children}
      {hint && (
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
