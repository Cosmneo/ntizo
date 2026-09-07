import { useState } from "react";
import { useTranslation } from "react-i18next";
import { hasContact } from "@ntizo/shared/text";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ntizo/frontend-ui";
import { useAttachments, type PendingAttachment } from "@/features/messaging/viewmodel/use-attachments";
import { QuoteAttachmentPicker } from "@/features/quotes/ui/attachment-picker";

const FORM_LABEL = "text-sm font-medium";
const TEXT_FIELD =
  "w-full rounded-[var(--radius-field)] border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 py-2.5 text-sm";

/** The words that differ between the three refusals this one dialog serves. */
const COPY: Record<
  "reject" | "withdraw" | "decline",
  { title: string; body: string; confirm: string }
> = {
  reject: { title: "close.rejectTitle", body: "close.rejectBody", confirm: "close.confirmReject" },
  withdraw: { title: "close.withdrawTitle", body: "close.withdrawBody", confirm: "close.confirmWithdraw" },
  decline: { title: "close.declineTitle", body: "close.declineBody", confirm: "close.confirmDecline" },
};

/**
 * The picker's own state, shared with a caller that wants the files it
 * collected to reach the network through the same `useAttachments` instance
 * the caller already owns (`quote-page.tsx` passes its own, so the files
 * picked here are the exact ones its `confirmClose` uploads once this dialog
 * hands them back). Not passed by a caller that has no such instance —
 * `CloseQuoteDialog` falls back to one of its own, which is what every test
 * in this file exercises.
 */
interface AttachmentsController {
  files: readonly PendingAttachment[];
  add: (file: File) => void;
  remove: (id: string) => void;
}

/**
 * One dialog for all three refusals: the customer's "Recusar", the customer's
 * "Retirar o pedido" and the provider's "Recusar pedido".
 *
 * They differ in three words and one list of reasons, which is why `kind` and
 * `reasons` are props rather than three components. A withdrawal has no reason
 * token — the customer changed their mind and there is nothing for the other
 * side to read into it — so `reasons: null` removes the fieldset entirely
 * rather than showing an empty one.
 *
 * The dialog does not own the mutation. It hands back what the person chose
 * and the page decides which write that is; `busy` and `notice` come back
 * down so a lost race can be shown here rather than behind a closed dialog.
 */
export function CloseQuoteDialog({
  kind,
  reasons,
  otherName,
  onConfirm,
  onClose,
  busy,
  notice,
  attachments: attachmentsProp,
}: {
  kind: "reject" | "withdraw" | "decline";
  reasons: readonly string[] | null;
  otherName: string;
  onConfirm: (v: { reason: string | null; note: string; files: File[] }) => void;
  onClose: () => void;
  busy: boolean;
  notice?: string;
  attachments?: AttachmentsController;
}) {
  const { t } = useTranslation("quotes");
  const [reason, setReason] = useState<string | null>(reasons ? (reasons[0] ?? null) : null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Always called, whether or not a caller shares its own — the rules of
  // hooks forbid calling this conditionally, and an unused instance costs
  // nothing.
  const own = useAttachments();
  const attachments = attachmentsProp ?? own;

  const copy = COPY[kind];
  const bodyValues = kind === "decline" ? { customer: otherName } : { provider: otherName };

  function submit() {
    setError(null);
    if (hasContact(note)) {
      setError("close.errorContact");
      return;
    }
    onConfirm({
      reason,
      note: note.trim(),
      files: attachments.files.map((f) => f.file),
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(copy.title)}</DialogTitle>
          <DialogDescription>{t(copy.body, bodyValues)}</DialogDescription>
        </DialogHeader>

        {reasons && (
          <fieldset className="grid gap-2 border-0 p-0">
            <legend className="type-body-medium font-semibold">{t("close.reasonLegend")}</legend>
            {reasons.map((token) => (
              <label
                key={token}
                className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-card-sm)] border border-[var(--color-border)] p-3"
              >
                <input
                  type="radio"
                  name="quote-close-reason"
                  value={token}
                  checked={reason === token}
                  onChange={() => setReason(token)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                <span className="type-body">{t(`close.reason.${token}`)}</span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="grid gap-1.5">
          <label htmlFor="quote-close-note" className={FORM_LABEL}>
            {t("close.noteLabel")}{" "}
            <span className="font-normal text-[var(--color-muted-foreground)]">
              ({t("close.optional")})
            </span>
          </label>
          <textarea
            id="quote-close-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className={TEXT_FIELD}
          />
        </div>

        <QuoteAttachmentPicker
          inputId="quote-close-files"
          label={t("close.fileAction")}
          files={attachments.files}
          onAdd={attachments.add}
          onRemove={attachments.remove}
          disabled={busy}
        />

        {(error ?? notice) && (
          <p role="alert" className="type-caption -mt-1 text-[var(--color-destructive)]">
            {t(error ?? notice!)}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("close.keep")}
          </Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={busy}>
            {t(copy.confirm)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
