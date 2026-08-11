import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, GripVertical, Loader2, MoreHorizontal, Plus } from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  cn,
} from "@ntizo/frontend-ui";
import type { Locale, ServicePricingMode } from "@ntizo/shared";
import {
  useAddServiceOption,
  useRemoveServiceOption,
  useReorderServiceOptions,
  useUpdateServiceOption,
} from "../viewmodel/use-service-editor";
import {
  emptyOptionDraft,
  moved,
  optionCanSubmit,
  optionDraftFrom,
  optionErrors,
  toOptionInput,
  type OptionDraft,
} from "../domain/service-draft";
import type { ServiceOption } from "../domain/types";

/**
 * The options a priced service is booked through: a list of cards, each
 * directly editable — name, pricing mode, price, and whichever duration
 * fields that mode asks for.
 *
 * Reordering by dragging, and move-up/move-down in each card's menu, for the
 * same reason the admin category list carries both: HTML5 drag events do not
 * fire for touch and cannot be driven from a keyboard, so dragging alone
 * would reorder nothing for most of the ways people use this list.
 */
export function OptionsEditor({
  providerId,
  serviceId,
  sourceLocale,
  options,
}: {
  providerId: string;
  serviceId: string;
  sourceLocale: Locale;
  options: readonly ServiceOption[];
}) {
  const { t } = useTranslation("provider");
  const addOption = useAddServiceOption(providerId);
  const updateOption = useUpdateServiceOption(providerId);
  const removeOption = useRemoveServiceOption(providerId);
  const reorder = useReorderServiceOptions(providerId, serviceId);

  const [error, setError] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function dropOn(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    reorder.mutate(moved(options, draggingId, indexDelta(options, draggingId, targetId)).map((o) => o.id));
  }

  return (
    <div className="grid gap-3">
      <span className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
        {t("serviceOptionsTitle")}
      </span>

      {error && <p className="type-body text-[var(--color-destructive)]">{error}</p>}

      {options.length === 0 && !addingNew && (
        <p className="type-body text-[var(--color-muted-foreground)]">{t("optionEmpty")}</p>
      )}

      <div className="grid gap-2.5">
        {options.map((option, i) => (
          <OptionCard
            key={option.id}
            option={option}
            sourceLocale={sourceLocale}
            draggable
            dragging={draggingId === option.id}
            onDragStart={() => setDraggingId(option.id)}
            onDragEnd={() => setDraggingId(null)}
            onDrop={() => {
              dropOn(option.id);
              setDraggingId(null);
            }}
            isFirst={i === 0}
            isLast={i === options.length - 1}
            onMove={(delta) =>
              reorder.mutate(moved(options, option.id, delta).map((o) => o.id))
            }
            onSave={async (draft) => {
              setError(null);
              try {
                await updateOption.mutateAsync({
                  serviceId,
                  optionId: option.id,
                  ...toOptionInput(draft),
                });
              } catch (e) {
                setError(serverErrorMessage(e, t));
                throw e;
              }
            }}
            onRemove={async () => {
              if (!window.confirm(t("optionRemoveConfirm"))) return;
              setError(null);
              try {
                await removeOption.mutateAsync({ serviceId, optionId: option.id });
              } catch (e) {
                setError(serverErrorMessage(e, t));
              }
            }}
          />
        ))}
      </div>

      {addingNew ? (
        <OptionCard
          option={null}
          sourceLocale={sourceLocale}
          onSave={async (draft) => {
            setError(null);
            try {
              await addOption.mutateAsync({ serviceId, ...toOptionInput(draft) });
              setAddingNew(false);
            } catch (e) {
              setError(serverErrorMessage(e, t));
              throw e;
            }
          }}
          onCancel={() => setAddingNew(false)}
        />
      ) : (
        <Button type="button" variant="outline" onClick={() => setAddingNew(true)}>
          <Plus className="h-4 w-4" />
          {t("optionAdd")}
        </Button>
      )}
    </div>
  );
}

/** How many places `targetId` sits from `draggingId`, in the current order — what dropping one row onto another means as a `moved()` delta. */
function indexDelta(options: readonly ServiceOption[], draggingId: string, targetId: string): number {
  const from = options.findIndex((o) => o.id === draggingId);
  const to = options.findIndex((o) => o.id === targetId);
  return to - from;
}

function serverErrorMessage(e: unknown, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const code = (e as { code?: string }).code ?? (e as Error).message;
  return t(`serviceError.${code}`, { defaultValue: t("optionSaveFailed") });
}

function OptionCard({
  option,
  sourceLocale,
  draggable,
  dragging,
  isFirst,
  isLast,
  onDragStart,
  onDragEnd,
  onDrop,
  onMove,
  onSave,
  onRemove,
  onCancel,
}: {
  option: ServiceOption | null;
  sourceLocale: Locale;
  draggable?: boolean;
  dragging?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
  onMove?: (delta: number) => void;
  onSave: (draft: OptionDraft) => Promise<void>;
  onRemove?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation("provider");
  const [draft, setDraft] = useState<OptionDraft>(() =>
    option ? optionDraftFrom(option, sourceLocale) : emptyOptionDraft(),
  );
  const [saving, setSaving] = useState(false);
  const errors = optionErrors(draft);

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
    } catch {
      // Left as-is: the parent already surfaced the message, and the draft
      // stays on screen so the person can fix it rather than retype it.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => draggable && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.();
      }}
      className={cn(
        "grid gap-3 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-4",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {draggable && (
            <span
              aria-hidden="true"
              title={t("optionReorder")}
              className="grid h-8 w-5 shrink-0 cursor-grab place-items-center text-[var(--color-muted-foreground)] active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder={t("optionNamePlaceholder")}
            aria-label={t("optionName")}
            className="flex-1"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {option?.isDefault && <Badge tone="info">{t("optionDefault")}</Badge>}
          {option && (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <button
                  type="button"
                  aria-label={t("optionActions")}
                  className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={isFirst} onSelect={() => onMove?.(-1)}>
                  <ArrowUp className="h-4 w-4" />
                  {t("optionMoveUp")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isLast} onSelect={() => onMove?.(1)}>
                  <ArrowDown className="h-4 w-4" />
                  {t("optionMoveDown")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onRemove}>{t("optionRemove")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* The two modes must not read alike: a fixed price is what the job
          costs, an hourly one is what an hour of it costs. Which fields
          appear below changes with the choice — an hourly option is never
          given a duration field to fill in, so the wrong combination the
          server refuses with `OPTION_DURATION_REQUIRED`/`_NOT_ALLOWED` is
          never something this form can build. */}
      <div role="radiogroup" aria-label={t("optionPricingMode")} className="flex gap-2">
        {(["fixed", "hourly"] as const).map((mode) => (
          <PricingModeButton
            key={mode}
            mode={mode}
            selected={draft.pricingMode === mode}
            onClick={() => setDraft((d) => ({ ...d, pricingMode: mode }))}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <OptionField
          label={t(draft.pricingMode === "fixed" ? "optionAmountFixed" : "optionAmountHourly")}
          hint={t(draft.pricingMode === "fixed" ? "optionAmountFixedHint" : "optionAmountHourlyHint")}
          error={errors.amount && t(`optionErrorField.${errors.amount}`)}
        >
          <Input
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
            placeholder="300,00"
          />
        </OptionField>

        {draft.pricingMode === "fixed" ? (
          <OptionField
            label={t("optionDuration")}
            hint={t("optionDurationHint")}
            error={errors.duration && t(`optionErrorField.${errors.duration}`)}
          >
            <Input
              inputMode="numeric"
              value={draft.duration}
              onChange={(e) => setDraft((d) => ({ ...d, duration: e.target.value }))}
              placeholder="30"
            />
          </OptionField>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <OptionField
              label={t("optionMin")}
              error={errors.min && t(`optionErrorField.${errors.min}`)}
            >
              <Input
                inputMode="numeric"
                value={draft.min}
                onChange={(e) => setDraft((d) => ({ ...d, min: e.target.value }))}
                placeholder="60"
              />
            </OptionField>
            <OptionField
              label={t("optionStep")}
              error={errors.step && t(`optionErrorField.${errors.step}`)}
            >
              <Input
                inputMode="numeric"
                value={draft.step}
                onChange={(e) => setDraft((d) => ({ ...d, step: e.target.value }))}
                placeholder="30"
              />
            </OptionField>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {option === null && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("optionCancel")}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!optionCanSubmit(draft) || saving}
          onClick={() => void save()}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {option ? t("optionSave") : t("optionAdd")}
        </Button>
      </div>
    </div>
  );
}

function PricingModeButton({
  mode,
  selected,
  onClick,
}: {
  mode: ServicePricingMode;
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("provider");
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "type-body rounded-full border px-4 py-1.5 transition-colors",
        selected
          ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] font-semibold text-[var(--color-primary)]"
          : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
      )}
    >
      {t(`optionPricing.${mode}`)}
    </button>
  );
}

function OptionField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <span className="type-caption text-[var(--color-muted-foreground)]">{label}</span>
      {children}
      {error ? (
        <span className="type-caption text-[var(--color-destructive)]">{error}</span>
      ) : hint ? (
        <span className="type-caption text-[var(--color-muted-foreground)]">{hint}</span>
      ) : null}
    </div>
  );
}
