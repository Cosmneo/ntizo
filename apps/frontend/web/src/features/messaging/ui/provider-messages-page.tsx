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
 * comment) and is not worked around here. One consequence worth flagging
 * because it is easy to miss: `ThreadView`'s `viewerUserId` decides which
 * bubble renders as "mine" by exact `senderUserId` match against the
 * signed-in staff member's own id, not against "anybody on this provider's
 * team" — the read model has no way to say "sent by this workspace" short
 * of that, since `Thread`/`Message` carry no `customerUserId` on the wire
 * (see this file's own note below). A second staff member replying in the
 * same thread will render as if the first one's earlier reply came from
 * the other side. That is a real gap, not a bug introduced here — closing
 * it needs the thread's customer identity on the wire, which today's
 * `ThreadSummaryDTO`/`MessagePageDTO` do not carry.
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

  // Marking a thread read is a side effect of opening it, not of every
  // render this page happens to do — same trade, same reasoning
  // `customer-messages-page.tsx`'s identical effect documents: `markRead`
  // is a fresh function identity every render (`useMarkRead` does not
  // memoise it), so it stays out of the dependency array on purpose.
  useEffect(() => {
    if (selectedThreadId) markRead(selectedThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  if (!activeProvider) return null;

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
                  {/* Always the fallback, never `selectedThread?.providerName`
                      the way the customer's header uses it: on this side
                      that field is this *workspace's own* name, identical
                      on every row (`ListProviderThreadsProjection` enriches
                      every thread with the one provider's name it belongs
                      to) — showing it here would repeat "Barbearia Central"
                      atop every conversation rather than say who it is
                      with. See this file's doc comment. */}
                  {t("conversationFallbackTitle")}
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
                  onSend={(body) => send(selectedThreadId, body)}
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
