import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { cn } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useActiveProvider } from "@/features/provider/viewmodel/use-active-provider";
import { usePageHeader } from "@/shared/lib/page-header";
import { useProviderThreads } from "@/features/messaging/viewmodel/use-provider-threads";
import { useThread } from "@/features/messaging/viewmodel/use-thread";
import { useSendMessage } from "@/features/messaging/viewmodel/use-send-message";
import { useMarkRead } from "@/features/messaging/viewmodel/use-mark-read";
import { ThreadList } from "@/features/messaging/ui/thread-list";
import { ThreadView } from "@/features/messaging/ui/thread-view";
import { MessageComposer } from "@/features/messaging/ui/message-composer";

/**
 * A workspace's inbox: every customer who has messaged this provider, and
 * the open conversation beside it.
 *
 * The provider-zone mirror of `customer-messages-page.tsx`, not a second
 * copy of the pieces underneath it — `ThreadList`, `ThreadView` and
 * `MessageComposer` are the exact same components Task 10 built, already
 * tested, already escaping message bodies as plain JSX text, already
 * capping a send at `MESSAGE_BODY_MAX_LENGTH`. What differs here is only
 * which query feeds the list (`useProviderThreads(providerId)` instead of
 * `useThreads()`) and the zone chrome around it (`usePageHeader` +
 * `useActiveProvider`, the same pair every sibling provider page uses —
 * see `ProviderWalletPage`, `ProviderActivityPage`).
 *
 * **A conversation belongs to the workspace, not to whichever staff member
 * opened it.** `useMarkRead` marks every unread message in a thread read
 * for the whole team, not just for the signed-in viewer — that is the
 * backend's own design (`MessageRepositoryPort.markReadForViewer`'s doc
 * comment) and is not worked around here.
 *
 * **The list and the header name the customer, not this workspace.**
 * `Thread.providerName` is this *workspace's own* name — identical on every
 * row of a provider's own inbox, since every row belongs to the one
 * provider whose inbox this is — so both the row and the open conversation's
 * header read `thread.customerName` instead (`ThreadList`'s `nameOf` prop;
 * see `Thread`'s own doc comment for why both fields exist on one shape).
 *
 * **Known, deliberate gap, not fixed here — labelling *which* teammate sent
 * a reply.** `ThreadView`'s `viewerUserId` decides which bubble renders as
 * "mine" by exact `senderUserId` match against the signed-in staff member's
 * own id, not against "anybody on this provider's team". `messageReadModel`
 * carries `senderUserId` and no name, so a second staff member's earlier
 * reply in the same thread renders as if it came from the customer rather
 * than a colleague. Invisible in the common single-owner workspace (the
 * only shape this phase's e2e exercises); a real multi-staff workspace
 * deserves its own naming decision, not one rushed in alongside
 * `customerName`.
 */
export function ProviderMessagesPage() {
  const { t: tProvider } = useTranslation("provider");
  const { t, i18n } = useTranslation("messaging");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { thread?: string };
  const selectedThreadId = search.thread ?? null;

  const { activeProvider } = useActiveProvider();
  const providerId = activeProvider?.id ?? "";

  usePageHeader(tProvider("nav.messages"), activeProvider?.name);

  const { data: me } = useCurrentUser();
  const {
    threads,
    loading: threadsLoading,
    hasMore: threadsHaveMore,
    loadMore: loadMoreThreads,
    errorCode: threadsErrorCode,
  } = useProviderThreads(providerId);
  const {
    messages,
    loading: messagesLoading,
    hasMore: messagesHaveMore,
    loadMore: loadMoreMessages,
  } = useThread(selectedThreadId ?? "");
  const { send, sending, errorCode: sendErrorCode } = useSendMessage();
  const { markRead } = useMarkRead();

  // The newest message the other side sent, if any — same reasoning
  // `customer-messages-page.tsx`'s identical constant documents: `messages`
  // is newest-first, so this is what makes an already-open thread mark a
  // reply read the moment the 5s poll lands it, not only when the thread is
  // first opened.
  const newestInboundMessageId = messages.find(
    (message) => message.senderUserId !== me?.id,
  )?.id;

  // Marking a thread read is a side effect of opening it, or of a new
  // message from the other side landing while it is open — same trade, same
  // reasoning `customer-messages-page.tsx`'s identical effect documents:
  // `markRead` is a fresh function identity every render (`useMarkRead`
  // does not memoise it), so it stays out of the dependency array on
  // purpose.
  useEffect(() => {
    if (selectedThreadId) markRead(selectedThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId, newestInboundMessageId]);

  if (!activeProvider) return null;

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;

  const selectThread = (threadId: string) =>
    void navigate({
      to: "/provider/$slug/messages",
      params: { slug: activeProvider.slug },
      search: { thread: threadId },
    });
  const backToList = () =>
    void navigate({
      to: "/provider/$slug/messages",
      params: { slug: activeProvider.slug },
      search: {},
    });

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
              emptyTitle={t("emptyTitle")}
              emptyBody={t("providerEmptyBody")}
              nameOf={(thread) => thread.customerName}
              fallbackName={t("unknownCustomer")}
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
                  {/* `customerName`, never `selectedThread?.providerName`
                      the way the customer's own header reads it — on this
                      side `providerName` is this workspace's own name.
                      Same fallback the customer's header uses for the
                      identical two cases (the thread not yet resolved in
                      the loaded page, or the name lookup missing) — a
                      neutral "Conversation" reads better as a heading than
                      the row-level `unknownCustomer` placeholder does. See
                      this file's doc comment. */}
                  {selectedThread?.customerName || t("conversationFallbackTitle")}
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
