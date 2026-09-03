import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";
import { Skeleton, cn } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import { AttachmentList } from "@/features/messaging/ui/attachment-list";
import type { Message } from "@/features/messaging/domain/types";

/**
 * One conversation's messages.
 *
 * `useThread` hands back messages newest-first — the order the wire sends
 * them in, and deliberately not re-sorted there (see that hook's own doc
 * comment: "a display that wants oldest-first is that display's choice to
 * make"). This is that display: a conversation reads top-to-bottom oldest
 * first, so the re-sort happens here, once, rather than asking every caller
 * of `useThread` to remember it.
 *
 * `body` renders through an ordinary JSX text child — `{message.body}` — and
 * nowhere else. That is the entire security property this component owns:
 * `shared/lib/i18n.ts` sets `interpolation: { escapeValue: false }` for
 * i18next's own sake, which means nothing upstream of this component is
 * escaping a message body for us. React escapes a JSX text child by
 * construction; a `dangerouslySetInnerHTML` here would not, and the message
 * a customer or provider reads was typed by the *other* party at the
 * keyboard, not by the party viewing it. See `__tests__/thread-view.test.tsx`
 * for the render-path check this claim has to survive.
 *
 * `message.attachments` carries the identical risk one field over —
 * `fileName` is also the other party's own input, chosen by them at upload
 * time, not by whoever is reading it here — and `AttachmentList` makes the
 * same commitment for it: every file name renders through an ordinary JSX
 * text child, never `dangerouslySetInnerHTML`. See that component's own doc
 * comment.
 */
export function ThreadView({
  messages,
  viewerUserId,
  platformLabel,
  loading = false,
  hasMore = false,
  onLoadMore,
}: {
  messages: readonly Message[];
  /** The signed-in reader's own user id — decides which bubbles render as "mine". Undefined renders every bubble as "theirs", never as "mine". */
  viewerUserId?: string;
  /** The name a `platform` message is captioned with — "Suporte Ntizo". Undefined on an inquiry, where no message is ever from the platform. */
  platformLabel?: string;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}) {
  const { t, i18n } = useTranslation("messaging");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  if (loading) {
    return (
      <ul className="grid list-none gap-3 p-0">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
            <Skeleton className="h-12 w-2/3 rounded-[var(--radius-card)]" />
          </li>
        ))}
      </ul>
    );
  }

  if (messages.length === 0) {
    return (
      <EmptyCard
        badge={MessageSquare}
        title={t("conversationEmptyTitle")}
        body={t("conversationEmptyBody")}
      />
    );
  }

  // Oldest first for display — see the doc comment above. `createdAt` is
  // ISO 8601, so lexical order is chronological order; no `Date` parse
  // needed to sort correctly.
  const ordered = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="grid gap-3">
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          className="type-body-medium mx-auto text-[var(--color-primary)] hover:underline"
        >
          {t("loadEarlier")}
        </button>
      )}

      <ul className="grid list-none gap-2.5 p-0">
        {ordered.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            mine={message.senderSide !== "platform" && message.senderUserId === viewerUserId}
            platformLabel={platformLabel}
            locale={locale}
          />
        ))}
      </ul>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  platformLabel,
  locale,
}: {
  message: Message;
  mine: boolean;
  platformLabel?: string;
  locale: string;
}) {
  const when = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(message.createdAt));

  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-[var(--radius-card)] px-3.5 py-2.5",
          mine
            ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
            : "bg-[var(--color-muted)] text-[var(--color-foreground)]",
        )}
      >
        {message.senderSide === "platform" && platformLabel && (
          <p className="type-caption mb-1 font-semibold text-[var(--color-muted-foreground)]">
            {platformLabel}
          </p>
        )}
        {/* An ordinary text child. React escapes this by construction — see
            this file's own doc comment for why that is load-bearing here. */}
        {message.body && (
          <p className="type-body whitespace-pre-wrap break-words">{message.body}</p>
        )}
        <AttachmentList attachments={message.attachments} />
        <time
          dateTime={message.createdAt}
          className={cn(
            "type-caption mt-1 block text-right",
            mine ? "text-[color-mix(in_srgb,var(--color-primary-foreground)_75%,transparent)]" : "text-[var(--color-muted-foreground)]",
          )}
        >
          {when}
        </time>
      </div>
    </li>
  );
}
