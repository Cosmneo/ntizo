import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Badge, Button, Skeleton } from "@ntizo/frontend-ui";
import { usePageHeader } from "@/shared/lib/page-header";
import { ThreadView } from "@/features/messaging/ui/thread-view";
import { MessageComposer } from "@/features/messaging/ui/message-composer";
import {
  useAdminSupportMessages,
  useAdminSupportRequest,
  useMarkSupportRequestRead,
  useReplyToSupportRequest,
  useResolveSupportRequest,
} from "@/features/admin/support/viewmodel/use-admin-support";

/**
 * One support request, read and answered by the platform.
 *
 * The same `ThreadView` and `MessageComposer` the participants use — with
 * `checkContact={false}`, because the platform giving out a number to call
 * back is the point, and `viewerUserId` deliberately unset: an admin's
 * bubbles align left like everyone else's here, and what names the platform
 * is `platformLabel`, not whose id matches.
 *
 * Opening the page marks it read for the platform (`supportMarkRead`), the
 * same act `/messages` performs for a participant, so the queue's unread
 * count means "nobody has looked at this".
 *
 * The back link stays mounted through every state — loading, errored,
 * missing, or found — on `provider-detail-page.tsx`'s model: a page that
 * drops its own chrome while it works loses the one way out an administrator
 * had, right when something has already gone wrong. `error` is read
 * separately from `data`/`isPending` for the same reason that page's own
 * `query.error` check exists: a request that failed to load and a thread id
 * that genuinely does not exist both settle to `isPending === false` and
 * `data === undefined`, and conflating them would tell an administrator
 * "no such request" about a request the backend never actually answered
 * for.
 *
 * `request` is checked BEFORE `error` in the branch below, not after — on
 * purpose, and for a reason that only shows up once something else on the
 * page triggers a background refetch. Marking the request read invalidates
 * `["admin","support"]` on success (`useSupportMutation`'s own doc comment),
 * which includes this very query; if that refetch then fails, React Query
 * keeps the last-good `request` in `data` while setting `error` alongside
 * it. Gating on `error` first would swap a request an administrator is
 * actively reading — resolve button, conversation and all — out for
 * "The request could not be loaded." on a transient hiccup that has nothing
 * to do with what is already on screen. `data` wins whenever it exists,
 * exactly as `provider-detail-page.tsx` shows `detail` regardless of
 * `query.error`; `supportLoadError` is reserved for when `request` was
 * never loaded at all.
 */
export function AdminSupportRequestPage() {
  const { t } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const { threadId } = useParams({ from: "/admin/support/$threadId" });
  const { data: request, isPending, error } = useAdminSupportRequest(threadId);
  const { messages, loading, hasMore, loadMore } = useAdminSupportMessages(threadId);
  const { reply, replying, errorCode } = useReplyToSupportRequest();
  const { resolve, resolving } = useResolveSupportRequest();
  const { markRead } = useMarkSupportRequestRead();

  usePageHeader(request?.subject ?? t("supportTitle"), request?.requesterName);

  const newestRequesterMessageId = messages.find((message) => message.senderSide !== "platform")?.id;

  // Same shape and same reasoning as the participant pages': marking read is
  // a side effect of opening the request, and of a new message landing while
  // it is open (the 5s poll brings it). `markRead` is a fresh identity each
  // render, so it stays out of the dependency array on purpose.
  useEffect(() => {
    if (threadId) markRead(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, newestRequesterMessageId]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link to="/admin/support" className="type-body-medium inline-flex items-center gap-1 text-[var(--color-muted-foreground)] no-underline">
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        {t("supportBackToQueue")}
      </Link>

      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
        {request ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="type-h2 font-semibold">{request.subject}</h1>
                <p className="type-caption mt-1 text-[var(--color-muted-foreground)]">
                  {t(`supportAudience.${request.audience}`)}
                </p>
              </div>
              <span className="flex items-center gap-2">
                <Badge tone={request.status === "open" ? "info" : "neutral"}>
                  {t(`supportStatus.${request.status}`)}
                </Badge>
                {request.status === "open" && (
                  <Button size="sm" disabled={resolving} onClick={() => resolve(request.threadId)}>
                    {t("supportResolve")}
                  </Button>
                )}
              </span>
            </div>

            <dl className="mt-5 grid gap-x-8 gap-y-3 border-t border-[var(--color-border)] pt-5 sm:grid-cols-2">
              <div>
                <dt className="type-caption text-[var(--color-muted-foreground)]">{t("supportWho")}</dt>
                <dd className="type-body">{request.requesterName}</dd>
              </div>
              {request.providerId && (
                <div>
                  <dt className="type-caption text-[var(--color-muted-foreground)]">{t("supportProvider")}</dt>
                  <dd className="type-body">
                    <Link to="/admin/providers/$providerId" params={{ providerId: request.providerId }}>
                      {request.providerName}
                    </Link>
                  </dd>
                </div>
              )}
              {request.bookingId && (
                <div>
                  <dt className="type-caption text-[var(--color-muted-foreground)]">{t("supportBooking")}</dt>
                  {/* An id, not a link: there is no admin page for a booking to
                      point at. It is here so somebody can find the row. */}
                  <dd className="type-body font-mono text-[13px]">{request.bookingId}</dd>
                </div>
              )}
            </dl>

            {request.status === "resolved" && (
              <p className="type-caption mt-4 text-[var(--color-muted-foreground)]">{t("supportResolvedNotice")}</p>
            )}
          </>
        ) : isPending ? (
          <div role="status" aria-label={tCommon("loading")} className="grid gap-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-16 w-full" />
          </div>
        ) : error ? (
          <p className="type-body text-[var(--color-destructive)]">{t("supportLoadError")}</p>
        ) : (
          <p className="type-body text-[var(--color-destructive)]">{t("supportNotFound")}</p>
        )}
      </section>

      {request && (
        <section className="flex min-h-[24rem] flex-col rounded-[var(--radius-card)] border border-[var(--color-border)]">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <ThreadView
              messages={messages}
              platformLabel={t("supportPlatformSender")}
              loading={loading}
              hasMore={hasMore}
              onLoadMore={loadMore}
            />
          </div>
          <div className="border-t border-[var(--color-border)] p-4 sm:p-5">
            <MessageComposer
              onSend={(body, attachments) => reply(request.threadId, body, attachments)}
              sending={replying}
              errorCode={errorCode}
              checkContact={false}
            />
          </div>
        </section>
      )}
    </div>
  );
}
