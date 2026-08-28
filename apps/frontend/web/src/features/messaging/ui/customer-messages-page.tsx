import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useThreads } from "@/features/messaging/viewmodel/use-threads";
import { useThread } from "@/features/messaging/viewmodel/use-thread";
import { useSendMessage } from "@/features/messaging/viewmodel/use-send-message";
import { useMarkRead } from "@/features/messaging/viewmodel/use-mark-read";
import { ThreadList } from "@/features/messaging/ui/thread-list";
import { ThreadView } from "@/features/messaging/ui/thread-view";
import { MessageComposer } from "@/features/messaging/ui/message-composer";

/**
 * The customer's inbox: every provider they have messaged, and the open
 * conversation beside it.
 *
 * `?thread=<id>` in the URL, not component state, carries which conversation
 * is open — the way `providers.index`'s filters live in the URL rather than
 * in a `useState` nobody can link to or reload. It is also how the
 * "message this provider" button on a provider's page hands off: it starts
 * (or resumes) a thread and navigates straight to `/messages?thread=<id>`,
 * and this page has nothing more to do than read that id back out.
 *
 * No measure of its own, same reasoning `placeholder-pages.tsx`'s `Shell`
 * gives: `CustomerShell` already wraps this in `.page-shell`, so this fills
 * it rather than centring a narrower column inside it — commit `6480a31`
 * removed exactly that `mx-auto max-w-3xl` because it started the content
 * 276px right of the logo.
 */
export function CustomerMessagesPage() {
  const { t, i18n } = useTranslation("messaging");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { thread?: string };
  const selectedThreadId = search.thread ?? null;

  const { data: me } = useCurrentUser();
  const {
    threads,
    loading: threadsLoading,
    hasMore: threadsHaveMore,
    loadMore: loadMoreThreads,
    errorCode: threadsErrorCode,
  } = useThreads();
  const {
    messages,
    loading: messagesLoading,
    hasMore: messagesHaveMore,
    loadMore: loadMoreMessages,
  } = useThread(selectedThreadId ?? "");
  const { send, sending, errorCode: sendErrorCode } = useSendMessage();
  const { markRead } = useMarkRead();

  // The newest message the other side sent, if any — `messages` is
  // newest-first (see `useThread`'s doc comment), so the first entry whose
  // sender is not the viewer is it. Bringing this into the effect below is
  // what makes an already-open thread mark a message read when it *arrives*
  // (the 5s poll lands it), not only when the thread is first opened: without
  // it, a reply that shows up while the customer is sitting on this exact
  // thread sits `read_at IS NULL` until they navigate away and back, and the
  // sweep two minutes later emails them about a message already on their
  // screen — see the spec's "a fast back-and-forth produces no email at all"
  // guarantee.
  const newestInboundMessageId = messages.find(
    (message) => message.senderUserId !== me?.id,
  )?.id;

  // Marking a thread read is a side effect of opening it, or of a new
  // message from the other side landing while it is open — not of every
  // render this page happens to do. `markRead` is a fresh function identity
  // each render (`useMarkRead` does not memoise it), so it stays out of the
  // dependency array on purpose. Same trade `page-header.tsx`'s
  // `usePageAction` documents for the same reason.
  useEffect(() => {
    if (selectedThreadId) markRead(selectedThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId, newestInboundMessageId]);

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;

  const selectThread = (threadId: string) =>
    void navigate({ to: "/messages", search: { thread: threadId } });
  const backToList = () => void navigate({ to: "/messages", search: {} });

  return (
    <div>
      <h1 className="type-h1">{t("title")}</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <div className={cn(selectedThreadId ? "hidden lg:block" : "block")}>
          {threadsErrorCode ? (
            <p className="type-body text-[var(--color-destructive)]">{t("loadError")}</p>
          ) : (
            <ThreadList
              threads={threads}
              loading={threadsLoading}
              selectedThreadId={selectedThreadId}
              onSelect={selectThread}
              hasMore={threadsHaveMore}
              onLoadMore={loadMoreThreads}
              locale={locale}
            />
          )}
        </div>

        <div
          className={cn(
            "flex min-h-[28rem] flex-col rounded-[var(--radius-card)] border border-[var(--color-border)]",
            selectedThreadId ? "flex" : "hidden lg:flex",
          )}
        >
          {selectedThreadId ? (
            <>
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3.5 sm:px-5">
                <button
                  type="button"
                  onClick={backToList}
                  aria-label={t("back")}
                  className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] lg:hidden"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="type-body-medium truncate font-semibold">
                  {selectedThread?.providerName || t("conversationFallbackTitle")}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                <ThreadView
                  messages={messages}
                  viewerUserId={me?.id}
                  loading={messagesLoading}
                  hasMore={messagesHaveMore}
                  onLoadMore={loadMoreMessages}
                />
              </div>

              <div className="border-t border-[var(--color-border)] p-4 sm:p-5">
                <MessageComposer
                  onSend={(body, attachments) => send(selectedThreadId, body, attachments)}
                  sending={sending}
                  errorCode={sendErrorCode}
                />
              </div>
            </>
          ) : (
            <EmptyCard
              className="flex-1"
              icon={MessageSquare}
              title={t("selectPrompt")}
              body={t("selectPromptBody")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
