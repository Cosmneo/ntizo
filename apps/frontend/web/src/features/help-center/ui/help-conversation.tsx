import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@ntizo/frontend-ui";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useThread } from "@/features/messaging/viewmodel/use-thread";
import { useSendMessage } from "@/features/messaging/viewmodel/use-send-message";
import { useMarkRead } from "@/features/messaging/viewmodel/use-mark-read";
import { ThreadView } from "@/features/messaging/ui/thread-view";
import { MessageComposer } from "@/features/messaging/ui/message-composer";
import type { Thread } from "@/features/messaging/domain/types";

/**
 * One request, read and answered inside the panel.
 *
 * The same `ThreadView` and `MessageComposer` the inboxes use: a support
 * conversation is a conversation, and a second renderer for it would drift
 * from the first the day attachments or read receipts change.
 *
 * Marking read on open (and when a reply lands while it is open) is the same
 * effect `customer-messages-page.tsx` documents, for the same reason — the
 * 2-minute sweep must not email somebody about a message on their screen.
 */
export function HelpConversation({ request }: { request: Thread | null }) {
  const { t } = useTranslation("help");
  const { data: me } = useCurrentUser();
  const threadId = request?.id ?? "";
  const { messages, loading, hasMore, loadMore } = useThread(threadId);
  const { send, sending, errorCode } = useSendMessage();
  const { markRead } = useMarkRead();

  const newestInboundMessageId = messages.find((message) => message.senderUserId !== me?.id)?.id;

  useEffect(() => {
    if (threadId) markRead(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, newestInboundMessageId]);

  if (!request) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <p className="type-body-medium truncate">{request.support?.subject}</p>
        <span className="mt-1 flex items-center gap-2">
          <Badge tone={request.support?.status === "open" ? "info" : "neutral"}>
            {t(`status.${request.support?.status ?? "open"}`)}
          </Badge>
        </span>
        {request.support?.status === "resolved" && (
          <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">{t("resolvedNotice")}</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ThreadView
          messages={messages}
          viewerUserId={me?.id}
          platformLabel={t("platformSender")}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      </div>

      <div className="border-t border-[var(--color-border)] p-4">
        <MessageComposer
          onSend={(body, attachments) => send(threadId, body, attachments)}
          sending={sending}
          errorCode={errorCode}
          checkContact={false}
        />
      </div>
    </div>
  );
}
