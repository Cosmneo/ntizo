import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Badge, Button } from "@ntizo/frontend-ui";
import type { ServiceStatus } from "@ntizo/shared";
import type { SectionState } from "../../domain/completeness";
import type { ServiceStep } from "../../domain/wizard-model";
import {
  formatOptionPrice,
  optionSourceName,
  ownerName,
  translatedCount,
  orderedLocales,
  STATUS_TONE,
  type ProviderService,
} from "../../domain/types";

/**
 * Step 6: everything the wizard asked, in one place, before it goes out.
 *
 * A review screen that says only "nothing is blocking you" is not a review —
 * it asks the provider to remember five screens rather than showing them. So
 * every answer is here, each beside the step that set it and each a way back
 * to that step. Publishing is a decision, and a decision needs what it is
 * about in front of it.
 *
 * This is also where the editor's old header and sticky bar ended up. That
 * page carried the status badge, the unpublish and archive buttons and the
 * publish blocker at the top of *every* section, so somebody filling in
 * prices read "a priced service needs at least one option" as a permanent
 * complaint rather than as the one thing left to do. Here it is a verdict,
 * delivered once, on the screen whose job is to deliver it.
 */
export function StepReview({
  service,
  categoryLabel,
  memberNames,
  locale,
  blocker,
  blockerStep,
  onSeek,
  canPublish,
  busy,
  onChangeStatus,
}: {
  /** Null in the beat between the create mutation resolving and the list refetching. */
  service: ProviderService | null;
  categoryLabel: string;
  memberNames: readonly string[];
  locale: string;
  blocker: SectionState["blockingCode"];
  /** The step that would fix `blocker`, when there is one to point at. */
  blockerStep: ServiceStep | null;
  onSeek: (step: ServiceStep) => void;
  /** Owners and admins publish; other members do not. */
  canPublish: boolean;
  busy: boolean;
  onChangeStatus: (status: ServiceStatus) => void;
}) {
  const { t } = useTranslation("provider");

  if (!service) {
    return (
      <p className="type-body text-[var(--color-muted-foreground)]">
        {t("serviceTranslationsSaveFirst")}
      </p>
    );
  }

  const source = service.translations.find((tr) => tr.locale === service.sourceLocale);
  const languageCount = translatedCount(service);
  const languageTotal = orderedLocales(service.sourceLocale).length;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-h3 font-semibold break-words">
            {source?.name ?? ownerName(service, locale)}
          </p>
          {source?.description ? (
            <p className="type-body mt-1 text-[var(--color-muted-foreground)]">
              {source.description}
            </p>
          ) : null}
        </div>
        <Badge tone={STATUS_TONE[service.status]}>{t(`servicesStatus.${service.status}`)}</Badge>
      </div>

      {/* Every answer, beside the step that set it. The label is the way back:
          finding a mistake here and having to hunt the rail for where it lives
          is the whole reason a review screen feels like a formality. */}
      <dl className="grid gap-0 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        <SummaryRow label={t("serviceCategory")} step="basics" onSeek={onSeek}>
          {categoryLabel || <Missing t={t} />}
        </SummaryRow>

        <SummaryRow label={t("serviceLocationQuestion")} step="basics" onSeek={onSeek}>
          {service.locationType === "remote"
            ? t("serviceLocationRemote")
            : t(`serviceLocationType.${service.locationType}`, {
                defaultValue: service.locationType,
              })}
        </SummaryRow>

        <SummaryRow label={t("serviceBookingModeQuestion")} step="booking" onSeek={onSeek}>
          {t(`serviceBookingMode.${service.bookingMode}`)}
        </SummaryRow>

        {memberNames.length > 0 && (
          <SummaryRow label={t("serviceMembersQuestion")} step="performers" onSeek={onSeek}>
            {memberNames.join(", ")}
          </SummaryRow>
        )}

        {service.bookingMode === "priced" && (
          <SummaryRow label={t("serviceOptionsTitle")} step="pricing" onSeek={onSeek}>
            {service.options.length === 0 ? (
              <Missing t={t} />
            ) : (
              <span className="grid gap-0.5">
                {service.options.map((option) => (
                  <span key={option.id}>
                    {optionSourceName(option, service.sourceLocale)} ·{" "}
                    <span className="tabular-nums">{formatOptionPrice(option, locale)}</span>
                  </span>
                ))}
              </span>
            )}
          </SummaryRow>
        )}

        <SummaryRow label={t("servicesLanguages")} step="languages" onSeek={onSeek}>
          <span className="tabular-nums">
            {languageCount}/{languageTotal}
          </span>
        </SummaryRow>
      </dl>

      {blocker ? (
        <button
          type="button"
          onClick={() => blockerStep && onSeek(blockerStep)}
          disabled={!blockerStep}
          className="type-body rounded-[var(--radius-field)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] px-4 py-3 text-left text-[var(--color-destructive)] enabled:hover:underline"
        >
          {t(`serviceError.${blocker}`)}
        </button>
      ) : (
        <p className="type-body inline-flex items-center gap-2 rounded-[var(--radius-field)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] px-4 py-3 text-[var(--color-primary)]">
          <Check className="h-4 w-4 shrink-0" />
          {t("serviceReviewReady")}
        </p>
      )}

      {/* Leaving the marketplace, for a service already on it. Not in the
          footer beside Publish: these two undo each other, and a row that
          offers both at once invites the wrong one. */}
      {canPublish ? (
        <div className="flex flex-wrap gap-2.5">
          {service.status === "published" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onChangeStatus("draft")}
            >
              {t("serviceUnpublish")}
            </Button>
          ) : null}
          {service.status !== "archived" ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onChangeStatus("archived")}
            >
              {t("serviceArchive")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One answer, with its label doubling as the way back to the step that set it. */
function SummaryRow({
  label,
  step,
  onSeek,
  children,
}: {
  label: string;
  step: ServiceStep;
  onSeek: (step: ServiceStep) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-4">
      <dt>
        <button
          type="button"
          onClick={() => onSeek(step)}
          className="type-caption text-left font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] hover:underline"
        >
          {label}
        </button>
      </dt>
      <dd className="type-body min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** An answer that has not been given, said plainly rather than left blank. */
function Missing({ t }: { t: (key: string) => string }) {
  return (
    <span className="text-[var(--color-muted-foreground)] italic">
      {t("serviceReviewMissing")}
    </span>
  );
}
