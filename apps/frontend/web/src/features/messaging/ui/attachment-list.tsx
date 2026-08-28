import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FileText, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { useAttachmentDownload } from "@/features/messaging/viewmodel/use-attachment-download";
import type { MessageAttachment } from "@/features/messaging/domain/types";

/** `1.2 KB`, `4.8 MB` — no library for two branches. Matches nothing else in this codebase closely enough to reuse. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The files one message carries.
 *
 * Nothing here fetches on mount. `messageAttachmentReadModel` already gives
 * every list item enough to render — `fileName`, `contentType` (image versus
 * PDF), `sizeBytes` — without a single byte of the file itself crossing the
 * network. The actual bytes are fetched only from `AttachmentItem`'s own
 * `open`, which nothing calls until a viewer clicks. A conversation with
 * twenty photos in it must not spend the data of somebody reading it on a
 * phone before they have asked to see any of them.
 */
export function AttachmentList({
  attachments,
}: {
  attachments: readonly MessageAttachment[];
}) {
  if (attachments.length === 0) return null;

  return (
    <ul className="mt-2 grid list-none gap-1.5 p-0">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <AttachmentItem attachment={attachment} />
        </li>
      ))}
    </ul>
  );
}

function AttachmentItem({ attachment }: { attachment: MessageAttachment }) {
  const { t } = useTranslation("messaging");
  const { state, objectUrl, open: openDownload } = useAttachmentDownload(attachment.id);
  const isImage = attachment.contentType.startsWith("image/");

  const open = useCallback(async () => {
    if (objectUrl) {
      // Already fetched once — a repeat click re-opens what is already here
      // rather than fetching the same bytes again.
      if (isImage) window.open(objectUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const url = await openDownload();
    if (url && !isImage) {
      // A PDF has no useful "loaded, waiting to be looked at" state to sit
      // in the way an image does — opening one means saving it, the same
      // moment its bytes arrive.
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.fileName;
      anchor.click();
    }
  }, [objectUrl, isImage, openDownload, attachment.fileName]);

  if (isImage) {
    return (
      <button
        type="button"
        onClick={() => void open()}
        disabled={state === "loading"}
        aria-label={attachment.fileName}
        className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--color-border)] bg-[var(--color-muted)] disabled:cursor-wait"
      >
        {state === "loaded" && objectUrl ? (
          <img
            src={objectUrl}
            alt={attachment.fileName}
            className="h-full w-full object-cover"
          />
        ) : state === "loading" ? (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--color-muted-foreground)]" />
        ) : state === "error" ? (
          <span className="type-caption px-2 text-center text-[var(--color-destructive)]">
            {t("attachmentLoadError")}
          </span>
        ) : (
          <ImageIcon className="h-6 w-6 text-[var(--color-muted-foreground)]" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={state === "loading"}
      className={cn(
        "type-body flex w-full items-center gap-2 rounded-[var(--radius-field)] border border-[var(--color-border)] px-3 py-2 text-left disabled:cursor-wait disabled:opacity-70",
        state !== "loading" && "hover:bg-[var(--color-muted)]",
      )}
    >
      {state === "loading" ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <FileText className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
      )}
      <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
      <span className="type-caption shrink-0 text-[var(--color-muted-foreground)]">
        {formatBytes(attachment.sizeBytes)}
      </span>
      {state === "error" && (
        <span className="type-caption shrink-0 text-[var(--color-destructive)]">
          {t("attachmentLoadError")}
        </span>
      )}
    </button>
  );
}
