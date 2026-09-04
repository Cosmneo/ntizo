import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { Button } from "@ntizo/frontend-ui";
import { EmptyCard } from "@/shared/components/empty-card";
import {
  useInbox,
  type InboxScope,
} from "@/features/notifications/viewmodel/use-inbox";
import { useMarkRead } from "@/features/notifications/viewmodel/use-mark-read";
import { InboxList } from "@/features/notifications/ui/inbox-list";

/**
 * One inbox, whichever scope asks for it.
 *
 * The personal inbox and a workspace's inbox differ only in which query feeds
 * them — `useInbox` and `useMarkRead` already branch on `scope` — so one page
 * serves both routes rather than two copies that would drift the moment one
 * of them changes. `scope` also decides the heading: "Notifications" for a
 * person, "Workspace notifications" for an organization, because the same
 * word means a different inbox depending on who is reading it.
 *
 * No zone-specific chrome here on purpose. The customer route renders this
 * directly with nothing around it; the provider route wraps it in the same
 * width constraint its sibling pages use and feeds the workspace's own title
 * to the shell's header. Neither wrapper belongs inside a component the other
 * zone also renders.
 *
 * **Notifications and nothing else.** A 320px "recent activity" column stood
 * beside this list in both zones until 2026-09-04, fed by `useMyActivity()`.
 * All three zones already have a page of their own for exactly that feed —
 * `/activity`, `/provider/$slug/activity`, `/admin/activity` — so the column
 * was a second copy of a whole page, glued to an unrelated one: it competed
 * with the inbox for the reader's attention, it made the phone layout a list
 * of notifications followed by a list of activity that looked like more
 * notifications, and it fired a second paged query on a page that had not
 * asked a question about activity. The dedicated pages keep it; this one is
 * the inbox.
 */
export function NotificationsPage({ scope }: { scope: InboxScope }) {
  const { t } = useTranslation("notifications");
  const { page, isPending, isError, hasMore, isLoadingMore, loadMore } = useInbox(scope);
  const { markOne, markAll, isMarkingAll } = useMarkRead(scope);

  const hasUnread = page.items.some((item) => !item.read);
  // Armed only when there is a page to get and none already on its way, so a
  // sentinel that stays on screen while the fetch lands does not ask twice.
  const sentinel = useLoadOnScroll(hasMore && !isLoadingMore, loadMore);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="type-h1">
          {scope.kind === "provider" ? t("providerTitle") : t("title")}
        </h1>
        {/* Rendered only when it can do something. An action over a list it
            cannot change is a button that lies. */}
        {hasUnread && (
          <Button
            type="button"
            variant="outline"
            disabled={isMarkingAll}
            onClick={() => markAll()}
          >
            {t("markAllRead")}
          </Button>
        )}
      </div>

      {isError ? (
        <p className="type-body text-[var(--color-destructive)]">{t("loadError")}</p>
      ) : isPending ? null : page.total === 0 ? (
        <EmptyCard framed badge={Bell} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <>
          <InboxList
            items={page.items}
            todayIso={new Date().toISOString()}
            onMarkRead={markOne}
          />
          {/* The list stops at twenty and grows from the bottom as the reader
              reaches it. This block used to be a sentence and nothing else —
              "Showing 20 of 25", with no way to see the other five — because
              `useInbox` took an offset no caller ever varied. It varies now.

              The button is not decoration next to the observer: it is the
              same element the observer watches, so scrolling here loads the
              next page and a keyboard or a screen reader gets there too. It
              is also what happens if the observer never fires at all, which a
              background tab is enough to cause. */}
          {hasMore && (
            <div ref={sentinel} className="flex flex-col items-center gap-3">
              <p className="type-caption text-[var(--color-muted-foreground)]">
                {t("showingCount", { shown: page.items.length, total: page.total })}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={isLoadingMore}
                onClick={() => loadMore()}
              >
                {t("loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Ask for the next page when the end of the list comes into view.
 *
 * `rootMargin: "300px"` fires before the reader actually hits the bottom, so
 * the rows are usually there by the time they arrive — roughly four cells of
 * warning at this list's density.
 *
 * `armed` is a plain boolean rather than a check inside the callback because
 * it belongs in the dependency list: when there is nothing left to fetch the
 * observer is torn down instead of firing into a no-op on every scroll.
 * `loadMore` is stable (`useInbox` wraps it), so this effect runs when the
 * answer changes and not on every render.
 *
 * No `typeof IntersectionObserver` guard. It exists in every browser this
 * ships to; the one environment without it is jsdom, and `src/test/setup.ts`
 * stubs it there for the same reason it stubs `scrollIntoView` — test-only
 * scaffolding does not belong in the component.
 */
function useLoadOnScroll(armed: boolean, loadMore: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !armed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [armed, loadMore]);

  return ref;
}
