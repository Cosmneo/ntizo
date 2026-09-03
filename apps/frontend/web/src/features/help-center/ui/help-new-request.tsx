import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Badge } from "@ntizo/frontend-ui";
import { type AttachmentDescriptor } from "@/features/messaging/domain/types";
import { MessageComposer } from "@/features/messaging/ui/message-composer";
import type { HelpPrefill } from "@/features/help-center/viewmodel/use-help-center";

export const SUPPORT_SUBJECT_MAX = 120;

/**
 * The one form in the panel: a subject and a first message.
 *
 * `MessageComposer` writes the body — it already owns attachment picking and
 * upload, and a second composer would be a second place for that to be
 * wrong — with `checkContact={false}`, because this thread is with the
 * platform and a phone number is what support most often needs.
 *
 * The subject is required by the server (1..120); the button stays disabled
 * without one rather than letting a submit come back refused. `blocked` is
 * the same principle applied to the workspace a provider request is filed
 * against — see its own doc below.
 */
export function HelpNewRequest({
  prefill,
  onClearPrefill,
  onSubmit,
  submitting,
  errorCode,
  audienceLabel,
  blocked,
}: {
  prefill: HelpPrefill | null;
  onClearPrefill: () => void;
  onSubmit: (subject: string, body: string, attachments: AttachmentDescriptor[]) => void;
  submitting: boolean;
  errorCode?: string;
  /** "Em nome de <provider>" when the panel was opened inside a workspace. Undefined for a personal request. */
  audienceLabel?: string;
  /**
   * Why this request cannot be sent yet, and whether that is a failure or
   * merely a wait. Set when the workspace the request would be filed under
   * is not known: the backend answers `SUPPORT_NOT_A_MEMBER` to a provider
   * request with no `providerId`, which renders as "You don't belong to
   * this provider" — an accusation aimed at a member, for a query that had
   * not landed. Better to say so here than to fail at the wire.
   */
  blocked?: { message: string; failed: boolean };
}) {
  const { t } = useTranslation("help");
  const [subject, setSubject] = useState(prefill ? t("bookingChip", { service: prefill.serviceName }) : "");

  const trimmed = subject.trim();
  const subjectValid = trimmed.length > 0 && trimmed.length <= SUPPORT_SUBJECT_MAX;

  return (
    <div className="grid gap-3 p-4">
      {audienceLabel && <p className="type-caption text-[var(--color-muted-foreground)]">{audienceLabel}</p>}

      {blocked && (
        <p
          role={blocked.failed ? "alert" : "status"}
          className={
            blocked.failed
              ? "type-caption text-[var(--color-destructive)]"
              : "type-caption text-[var(--color-muted-foreground)]"
          }
        >
          {blocked.message}
        </p>
      )}

      {prefill && (
        <span className="flex items-center gap-2">
          <Badge tone="info">{t("bookingChip", { service: prefill.serviceName })}</Badge>
          <button
            type="button"
            onClick={onClearPrefill}
            aria-label={t("bookingChipRemove")}
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      )}

      <label className="grid gap-1">
        <span className="type-caption font-semibold">{t("subjectLabel")}</span>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder={t("subjectPlaceholder")}
          maxLength={SUPPORT_SUBJECT_MAX}
          aria-label={t("subjectLabel")}
          className="type-body w-full rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
        />
        <span className="type-caption text-right text-[var(--color-muted-foreground)]">
          {t("subjectHint", { count: trimmed.length })}
        </span>
      </label>

      {errorCode && (
        <p className="type-body text-[var(--color-destructive)]">
          {t(`error.${errorCode}`, { defaultValue: t("error.GENERIC") })}
        </p>
      )}

      <MessageComposer
        onSend={(body, attachments) => onSubmit(trimmed, body, attachments)}
        sending={submitting}
        disabled={!subjectValid || blocked !== undefined}
        checkContact={false}
      />
    </div>
  );
}
