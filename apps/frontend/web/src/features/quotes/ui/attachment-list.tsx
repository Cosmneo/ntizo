import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { QuoteAttachmentDTO } from "@/features/quotes/viewmodel/use-my-quotes";
import { useQuoteAttachmentDownload } from "@/features/quotes/viewmodel/use-quote-attachment-download";

/** Bytes as a person would say them. Kept local: nothing else in the app needs it yet. */
function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What one side attached, at one step. Each row saves the file; nothing opens in a tab. */
export function QuoteAttachmentList({ attachments }: { attachments: readonly QuoteAttachmentDTO[] }) {
  const { t } = useTranslation("quotes");
  const { download, failedId } = useQuoteAttachmentDownload();

  if (attachments.length === 0) return null;

  return (
    <ul className="grid list-none gap-1.5 p-0">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <button
            type="button"
            onClick={() => download(attachment)}
            aria-label={t("attachment.download", { name: attachment.fileName })}
            className="type-caption flex w-full items-center gap-2 rounded-[var(--radius-field)] border border-[var(--color-border)] px-2.5 py-1.5 text-left hover:border-[var(--color-primary)]"
          >
            <FileText className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
            <span className="shrink-0 text-[var(--color-muted-foreground)] tabular-nums">
              {sizeLabel(attachment.sizeBytes)}
            </span>
          </button>
          {failedId === attachment.id && (
            <p role="alert" className="type-caption mt-1 text-[var(--color-destructive)]">
              {t("attachment.downloadFailed")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
