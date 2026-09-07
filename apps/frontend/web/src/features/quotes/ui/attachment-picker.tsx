import { Paperclip, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buttonVariants, cn } from "@ntizo/frontend-ui";
import {
  ACCEPTED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS,
} from "@/features/messaging/domain/types";
import type { PendingAttachment } from "@/features/messaging/viewmodel/use-attachments";

const ACCEPT_ATTR = ACCEPTED_ATTACHMENT_TYPES.join(",");
const MAX_ATTACHMENT_MB = MAX_ATTACHMENT_BYTES / (1024 * 1024);
const ACCEPTED_FORMATS_LABEL = ACCEPTED_ATTACHMENT_TYPES
  .map((type) => type.split("/")[1]!.toUpperCase())
  .join(", ");

/**
 * The quote flow's file picker: the messaging one's construction with the
 * mockup's words.
 *
 * Same `<label htmlFor>` around a visually hidden `<input type="file">`, same
 * reset-before-dispatch so re-picking one file fires, same second-line check
 * on the cap. What differs is the face: the request page says "Juntar fotos"
 * and the proposal form says "Juntar ficheiro", both as a visible button
 * rather than a paperclip, so `label` and `inputId` are the caller's.
 *
 * Per-file failures render `pending.errorKey` from the **messaging**
 * namespace, because `useAttachments` writes those keys and those sentences
 * already exist in eight languages. One source of truth for "this file is too
 * big", not two that drift.
 */
export function QuoteAttachmentPicker({
  inputId, label, hint, files, onAdd, onRemove, disabled = false,
}: {
  inputId: string;
  label: string;
  hint?: string;
  files: readonly PendingAttachment[];
  onAdd: (file: File) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("quotes");
  const { t: tm } = useTranslation("messaging");
  const atLimit = files.length >= MAX_ATTACHMENTS;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor={inputId}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "cursor-pointer",
            (disabled || atLimit) && "pointer-events-none opacity-50",
          )}
        >
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          {label}
        </label>
        <input
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          accept={ACCEPT_ATTR}
          aria-label={label}
          disabled={disabled || atLimit}
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            // Reset first: picking the exact same file twice in a row fires no
            // change event otherwise, which reads as the second attempt being
            // silently ignored.
            event.target.value = "";
            picked.forEach(onAdd);
          }}
        />
        {hint && !atLimit && (
          <p className="type-caption text-[var(--color-muted-foreground)]">{hint}</p>
        )}
        {atLimit && (
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {t("attachment.tooMany", { max: MAX_ATTACHMENTS })}
          </p>
        )}
      </div>

      {files.length > 0 && (
        <ul className="grid list-none gap-1.5 p-0">
          {files.map((pending) => (
            <li
              key={pending.id}
              className="type-caption flex flex-wrap items-center gap-2 rounded-[var(--radius-field)] border border-[var(--color-border)] px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate">{pending.file.name}</span>
              <button
                type="button"
                onClick={() => onRemove(pending.id)}
                aria-label={t("attachment.remove", { name: pending.file.name })}
                className="shrink-0 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {pending.errorKey && (
                <p role="alert" className="type-caption w-full text-[var(--color-destructive)]">
                  {tm(pending.errorKey, { maxMB: MAX_ATTACHMENT_MB, formats: ACCEPTED_FORMATS_LABEL })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
