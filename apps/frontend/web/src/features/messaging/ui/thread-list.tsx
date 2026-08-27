import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";
import { Skeleton, cn } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import type { Thread } from "@/features/messaging/domain/types";

/**
 * The customer's own inbox — every provider they have messaged, newest last
 * message first (the order `useThreads` already hands back; this component
 * does not re-sort).
 *
 * A dumb list, the same split `ActivityList` and `InboxList` make: this
 * component takes `threads` + `loading` as props rather than calling
 * `useThreads()` itself, so `customer-messages-page.tsx` is the only place
 * that owns the query and `selectedThreadId` can live beside it.
 */
export function ThreadList({
  threads,
  loading,
  selectedThreadId,
  onSelect,
  hasMore,
  onLoadMore,
  locale,
}: {
  threads: readonly Thread[];
  loading: boolean;
  selectedThreadId: string | null;
  onSelect: (threadId: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  locale: string;
}) {
  const { t } = useTranslation("messaging");

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <div className="px-4 py-4 sm:px-5">
        <p className="type-caption font-bold tracking-[0.14em] text-[var(--color-muted-foreground)] uppercase">
          {t("listTitle")}
        </p>
      </div>

      <div className="border-t border-[var(--color-border)]">
        {loading ? (
          <ThreadListSkeleton />
        ) : threads.length === 0 ? (
          <EmptyCard badge={MessageSquare} title={t("emptyTitle")} body={t("emptyBody")} />
        ) : (
          <ul className="grid list-none gap-0 p-0">
            {threads.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                selected={thread.id === selectedThreadId}
                locale={locale}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>

      {!loading && hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          className="type-body-medium w-full border-t border-[var(--color-border)] px-4 py-3 text-center text-[var(--color-primary)] hover:bg-[var(--color-secondary)] sm:px-5"
        >
          {t("loadMore")}
        </button>
      )}
    </div>
  );
}

function ThreadRow({
  thread,
  selected,
  locale,
  onSelect,
}: {
  thread: Thread;
  selected: boolean;
  locale: string;
  onSelect: (threadId: string) => void;
}) {
  const { t } = useTranslation("messaging");
  const when = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(thread.lastMessageAt));

  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(thread.id)}
        className={cn(
          "flex w-full items-start gap-3 border-t border-[var(--color-border)] px-4 py-3.5 text-left transition-colors first:border-t-0 sm:px-5",
          selected
            ? "bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
            : "hover:bg-[var(--color-muted)]",
        )}
      >
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
        >
          <MessageSquare className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "type-body-medium truncate",
                thread.unreadCount > 0 && "font-semibold",
              )}
            >
              {thread.providerName || t("unknownProvider")}
            </span>
            <time
              dateTime={thread.lastMessageAt}
              className="type-caption shrink-0 text-[var(--color-muted-foreground)]"
            >
              {when}
            </time>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="type-caption truncate text-[var(--color-muted-foreground)]">
              {thread.lastMessagePreview || t("noPreview")}
            </span>
            {thread.unreadCount > 0 && (
              <span
                aria-label={t("unreadBadge", { count: thread.unreadCount })}
                className="type-caption grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--color-primary)] px-1.5 font-semibold text-[var(--color-primary-foreground)]"
              >
                {thread.unreadCount}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Sized to the row it stands in for — two lines of text beside a 36px disc —
 * so the list does not change height the moment the first page lands. Same
 * reasoning `ActivitySkeleton` gives for its own bars.
 */
function ThreadListSkeleton() {
  return (
    <ul className="grid list-none gap-0 p-0">
      {Array.from({ length: 5 }, (_, i) => (
        <li
          key={i}
          className="flex items-start gap-3 border-t border-[var(--color-border)] px-4 py-3.5 first:border-t-0 sm:px-5"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-[15px] w-32 max-w-full" />
            <Skeleton className="h-[13px] w-44 max-w-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}
