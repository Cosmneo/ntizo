import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, cn } from "@ntizo/frontend-ui";
import { MESSAGE_BODY_MAX_LENGTH } from "@/features/messaging/domain/types";

/** `sendError.*` codes with their own sentence — anything else falls back to `sendError.GENERIC`. */
const KNOWN_SEND_ERRORS = new Set([
  "VALIDATION_ERROR",
  "THREAD_NOT_VISIBLE",
  "UNAUTHENTICATED",
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
 * this app makes: `onSend` is called with a trimmed, non-empty body and
 * nothing else — `customer-messages-page.tsx` owns the actual
 * `useSendMessage()` call and passes `sending`/`errorCode` back down.
 */
export function MessageComposer({
  onSend,
  sending = false,
  disabled = false,
  errorCode,
}: {
  onSend: (body: string) => void;
  sending?: boolean;
  disabled?: boolean;
  errorCode?: string;
}) {
  const { t } = useTranslation("messaging");
  const [body, setBody] = useState("");

  const trimmed = body.trim();
  const tooLong = trimmed.length > MESSAGE_BODY_MAX_LENGTH;
  const canSend = trimmed.length > 0 && !tooLong && !sending && !disabled;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;
    onSend(trimmed);
    setBody("");
  };

  const errorKey = errorCode && KNOWN_SEND_ERRORS.has(errorCode) ? errorCode : "GENERIC";

  return (
    <form onSubmit={handleSubmit} className="grid gap-2">
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
          {sending ? t("sending") : t("send")}
        </Button>
      </div>

      {errorCode && (
        <p role="alert" className="type-caption text-[var(--color-destructive)]">
          {t(`sendError.${errorKey}`)}
        </p>
      )}
    </form>
  );
}
