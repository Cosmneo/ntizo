import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Skeleton } from "@ntizo/frontend-ui";
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
 *
 * `request` is `null` for exactly one reason, never two: this component is
 * only ever mounted for `screen === "conversation"`, which only happens
 * after `openThread` has already chosen a thread id — so a `null` request
 * here always means "the requests list has not caught up yet" (right after
 * `useOpenSupportRequest` resolves, its invalidation is an async refetch,
 * and the brand-new thread is not in the list for that beat), never "there
 * is nothing to show". The header renders a skeleton for that beat instead
 * of the component returning nothing; `threadId` is empty for the same
 * beat, so `useThread` and the messages it drives are already the disabled,
 * loading state `ThreadView` knows how to render.
 */
export function HelpConversation({ request }: { request: Thread | null }) {
  const { t } = useTranslation("help");
  const { data: me } = useCurrentUser();
  const threadId = request?.id ?? "";
  const { messages, loading, hasMore, loadMore, errorCode: threadErrorCode } = useThread(threadId);
  const { send, sending, errorCode: sendErrorCode } = useSendMessage();
  const { markRead } = useMarkRead();

  const newestInboundMessageId = messages.find((message) => message.senderUserId !== me?.id)?.id;

  useEffect(() => {
    if (threadId) markRead(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, newestInboundMessageId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        {request ? (
          <>
            <p className="type-body-medium truncate">{request.support?.subject}</p>
            <span className="mt-1 flex items-center gap-2">
              <Badge tone={request.support?.status === "open" ? "info" : "neutral"}>
                {t(`status.${request.support?.status ?? "open"}`)}
              </Badge>
            </span>
            {request.support?.status === "resolved" && (
              <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">{t("resolvedNotice")}</p>
            )}
          </>
        ) : (
          <Skeleton className="h-5 w-40" />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {threadErrorCode ? (
          // Distinct from `ThreadView`'s own empty state: an unauthorised or
          // failed load is not "say hello, this conversation has not
          // started" — that copy would tell a reader whose messages simply
          // failed to load that there is nothing there at all.
          <p className="type-body text-[var(--color-destructive)]">{t("conversationError")}</p>
        ) : (
          <ThreadView
            messages={messages}
            viewerUserId={me?.id}
            platformLabel={t("platformSender")}
            loading={loading || !request}
            hasMore={hasMore}
            onLoadMore={loadMore}
          />
        )}
      </div>

      <div className="border-t border-[var(--color-border)] p-4">
        <MessageComposer
          onSend={(body, attachments) => send(threadId, body, attachments)}
          sending={sending}
          errorCode={sendErrorCode}
          checkContact={false}
        />
      </div>
    </div>
  );
}
