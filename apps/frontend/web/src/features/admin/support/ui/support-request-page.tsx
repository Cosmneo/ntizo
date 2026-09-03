import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Badge, Button } from "@ntizo/frontend-ui";
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
 */
export function AdminSupportRequestPage() {
  const { t } = useTranslation("admin");
  const { threadId } = useParams({ from: "/admin/support/$threadId" });
  const { data: request, isPending } = useAdminSupportRequest(threadId);
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

  if (isPending) return <p className="type-body">…</p>;
  if (!request) return <p className="type-body text-[var(--color-destructive)]">{t("supportNotFound")}</p>;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link to="/admin/support" className="type-body-medium inline-flex items-center gap-1 text-[var(--color-muted-foreground)] no-underline">
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        {t("supportBackToQueue")}
      </Link>

      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
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
      </section>

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
    </div>
  );
}
