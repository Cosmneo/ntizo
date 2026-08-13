import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Badge, Button } from "@ntizo/frontend-ui";
import type { ServiceStatus } from "@ntizo/shared";
import type { SectionState } from "../../domain/completeness";
import type { ServiceStep } from "../../domain/wizard-model";
import { STATUS_TONE, type ProviderService } from "../../domain/types";

/**
 * Step 7: the last look before the service goes on the marketplace.
 *
 * This screen is where the editor's header and sticky bar ended up. The old
 * page carried the status badge, the unpublish and archive buttons and the
 * blocker message at the top of every section, which meant a provider filling
 * in prices read "a priced service needs at least one option" as a permanent
 * complaint rather than as the one thing left to do. Here it is a verdict,
 * delivered once, on the screen whose job is to deliver it.
 *
 * The blocker is a button: it names what is missing *and* goes there. A
 * message that names a problem without offering the way to it makes the
 * reader hunt through six steps for the screen it meant.
 */
export function StepReview({
  service,
  blocker,
  blockerStep,
  onSeek,
  canPublish,
  busy,
  onChangeStatus,
}: {
  /** Null in the beat between the create mutation resolving and the list refetching. */
  service: ProviderService | null;
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

  return (
    <div className="grid gap-6">
      {service ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="type-body-medium font-semibold">
            {service.translations.find((tr) => tr.locale === service.sourceLocale)?.name ?? ""}
          </span>
          <Badge tone={STATUS_TONE[service.status]}>
            {t(`servicesStatus.${service.status}`)}
          </Badge>
        </div>
      ) : null}

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
      {service && canPublish ? (
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
              variant="ghost"
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
