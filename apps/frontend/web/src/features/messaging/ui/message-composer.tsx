import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, cn } from "@ntizo/frontend-ui";
import { hasContact } from "@ntizo/shared/text";
import {
  MAX_ATTACHMENTS,
  MESSAGE_BODY_MAX_LENGTH,
  type AttachmentDescriptor,
} from "@/features/messaging/domain/types";
import { useAttachments } from "@/features/messaging/viewmodel/use-attachments";
import { AttachmentPicker } from "@/features/messaging/ui/attachment-picker";

/** `sendError.*` codes with their own sentence — anything else falls back to `sendError.GENERIC`. */
const KNOWN_SEND_ERRORS = new Set([
  "VALIDATION_ERROR",
  "THREAD_NOT_VISIBLE",
  "UNAUTHENTICATED",
  // The three domain refusals `SendMessageCommand`'s own aggregate and
  // resolve step can throw once a message may carry files: an
  // attachment-count race with `MAX_ATTACHMENTS` (client-checked too, but
  // the server has the last word), and a descriptor that no longer resolves
  // against storage (`resolveAttachments`) — a stale pick from a session
  // that lapsed, or a file this sender never actually owned.
  "MESSAGE_EMPTY",
  "TOO_MANY_ATTACHMENTS",
  "ATTACHMENT_NOT_AVAILABLE",
  // `SendMessageCommand.execute` runs `hasContact` on the trimmed body,
  // before anything is written — the gate `bodyHasContact` below is the
  // client-side hint for, not a substitute for. A `curl` that skips this
  // component entirely still gets refused with this code.
  "MESSAGE_CONTAINS_CONTACT",
]);

/**
 * Writing one message into an open thread.
 *
 * `maxLength={MESSAGE_BODY_MAX_LENGTH}` on the field itself, not just a
 * counter beside it — the server refuses a body over 4000 characters with
 * `VALIDATION_ERROR`, and letting someone type a whole extra paragraph past
 * that bound only to lose it on submit is the failure this component exists
 * to avoid. The counter still renders, so running up against the limit is
 * visible before it is a wall.
 *
 * A dumb form, the same split every other mutation-driving component in
 * this app makes: `onSend` is called with a trimmed body and whatever files
 * finished uploading, and nothing else — `customer-messages-page.tsx` owns
 * the actual `useSendMessage()` call and passes `sending`/`errorCode` back
 * down. `useAttachments()` is the one exception to "dumb": picking and
 * uploading files has to happen somewhere before `onSend` can be called at
 * all (a `File` is not what `communicationSend` accepts — a bare
 * `storageKey` is), and this component is where a submit turns into that
 * upload.
 *
 * A body is no longer required — `Message.compose`'s own rule is "something
 * in it, not necessarily words" (see `MESSAGE_EMPTY`'s doc comment on the
 * backend). `canSend` reflects that: a body OR at least one picked file is
 * enough.
 *
 * The contact warning runs on every keystroke, not on submit — `hasContact`
 * is the *same function* the server runs, both on file names
 * (`apps/backend/api/src/attachments.ts`) and, since the whole-branch
 * review closed the gap where it did not, on this body too
 * (`SendMessageCommand.execute`, before anything is written). So a message
 * this component refuses to send is one the server would have refused
 * anyway — but the reverse also matters now: this is a client-side hint,
 * and the server's check is the actual gate, reachable by anything that
 * skips this component entirely. Finding out a message is invalid only
 * after writing the whole thing is the worst moment to learn it; this shows
 * it while the sender is still typing.
 */
export function MessageComposer({
  onSend,
  sending = false,
  disabled = false,
  errorCode,
  checkContact = true,
}: {
  onSend: (body: string, attachments: AttachmentDescriptor[]) => void;
  sending?: boolean;
  disabled?: boolean;
  errorCode?: string;
  /**
   * Whether to refuse a body carrying a phone number or an email.
   * `true` between a customer and a provider — the anti-disintermediation
   * rule the server also enforces. `false` on a support thread, where
   * giving the platform a number to call back is the point (the server
   * skips it there too — `SendMessageCommand`).
   */
  checkContact?: boolean;
}) {
  const { t } = useTranslation("messaging");
  const [body, setBody] = useState("");
  const { files, add, remove, reset, uploading, uploadAll } = useAttachments();

  const trimmed = body.trim();
  const tooLong = trimmed.length > MESSAGE_BODY_MAX_LENGTH;
  const bodyHasContact = checkContact && hasContact(body);
  const hasFileErrors = files.some((f) => f.errorKey !== null);
  const busy = sending || uploading;

  const canSend =
    (trimmed.length > 0 || files.length > 0) &&
    !tooLong &&
    !bodyHasContact &&
    !hasFileErrors &&
    !busy &&
    !disabled;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;

    // `uploadAll` resolves `null` the moment any file fails — the failed
    // file's own `errorKey` is already updated for the picker to show, and
    // nothing here must send a message referencing only whichever files
    // happened to upload first.
    const attachments = await uploadAll();
    if (attachments === null) return;

    onSend(trimmed, attachments);
    setBody("");
    reset();
  };

  const errorKey = errorCode && KNOWN_SEND_ERRORS.has(errorCode) ? errorCode : "GENERIC";

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-2">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t("composerPlaceholder")}
        aria-label={t("composerLabel")}
        disabled={disabled}
        maxLength={MESSAGE_BODY_MAX_LENGTH}
        rows={3}
        className="type-body min-h-[4.5rem] w-full resize-y rounded-[var(--radius-field)] border border-[var(--color-input)] bg-[var(--color-background)] px-3.5 py-2.5 placeholder:text-[var(--color-muted-foreground)] focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-primary)_25%,transparent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />

      {bodyHasContact && (
        <p role="alert" className="type-caption text-[var(--color-destructive)]">
          {t("contactWarning")}
        </p>
      )}

      <AttachmentPicker files={files} onAdd={add} onRemove={remove} disabled={disabled || busy} />

      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "type-caption",
            tooLong ? "text-[var(--color-destructive)]" : "text-[var(--color-muted-foreground)]",
          )}
        >
          {t("charCount", { count: trimmed.length, max: MESSAGE_BODY_MAX_LENGTH })}
        </span>
        <Button type="submit" disabled={!canSend}>
          {busy ? t("sending") : t("send")}
        </Button>
      </div>

      {errorCode && (
        <p role="alert" className="type-caption text-[var(--color-destructive)]">
          {t(`sendError.${errorKey}`, { max: MAX_ATTACHMENTS })}
        </p>
      )}
    </form>
  );
}
