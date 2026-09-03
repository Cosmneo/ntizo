import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { Badge, Button } from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { useAdminSupport, useSupportOpenCount } from "@/features/admin/support/viewmodel/use-admin-support";
import type { AdminSupportSearch } from "@/features/admin/support/data/admin-support.repository";

/**
 * The support queue: what people asked the platform, and what is still open.
 *
 * Open by default — the queue is worked, not browsed — the same posture
 * `/admin/contact` takes. The two queues are deliberately separate: contact
 * requests arrive from anonymous forms and are answered by email; these are
 * threads with signed-in people and are answered here.
 *
 * No search box: a request is found by its subject in a list of open ones,
 * and the backend has no search argument to offer. `CollectionCard` wants
 * `search`/`onSearchChange`, so they are passed as a controlled empty value.
 */
export function AdminSupportPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const [status, setStatus] = useState<AdminSupportSearch["status"]>("open");
  const [audience, setAudience] = useState<AdminSupportSearch["audience"]>(undefined);

  const search: AdminSupportSearch = {
    ...(status ? { status } : {}),
    ...(audience ? { audience } : {}),
  };
  const { requests, loading, hasMore, loadMore, errorCode } = useAdminSupport(search);
  const openCount = useSupportOpenCount();

  usePageHeader(t("supportTitle"), t("supportSubtitle"));

  const when = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {errorCode && <p className="type-body text-[var(--color-destructive)]">{t("supportError")}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body">{t("supportOpenCount", { count: openCount.data ?? 0 })}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={status === "open" ? "default" : "outline"} size="sm" onClick={() => setStatus("open")}>
            {t("supportStatus.open")}
          </Button>
          <Button variant={status === "resolved" ? "default" : "outline"} size="sm" onClick={() => setStatus("resolved")}>
            {t("supportStatus.resolved")}
          </Button>
          <Button variant={status === undefined ? "default" : "outline"} size="sm" onClick={() => setStatus(undefined)}>
            {t("supportStatusAll")}
          </Button>
          <span className="mx-1 hidden w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />
          <Button variant={audience === undefined ? "default" : "outline"} size="sm" onClick={() => setAudience(undefined)}>
            {t("supportAudienceAll")}
          </Button>
          <Button variant={audience === "customer" ? "default" : "outline"} size="sm" onClick={() => setAudience("customer")}>
            {t("supportAudience.customer")}
          </Button>
          <Button variant={audience === "provider" ? "default" : "outline"} size="sm" onClick={() => setAudience("provider")}>
            {t("supportAudience.provider")}
          </Button>
        </div>
      </div>

      <CollectionCard
        title={t("supportTitle")}
        shown={requests.length}
        total={requests.length}
        // `supportRequests` is cursor-paged and never returns a count: once
        // another page exists, `requests.length` is only how many are
        // loaded so far, not the whole. Rather than pass it off as `total`
        // (a lie the moment `hasMore` is true), tell `CollectionCard` the
        // total is not known and let it say "N shown" instead of "N of N".
        totalUnknown={hasMore}
        loading={loading}
        search=""
        onSearchChange={() => {}}
        searchPlaceholder=""
        columns={[
          { key: "request", label: t("supportRequest"), className: "pl-5" },
          { key: "who", label: t("supportWho"), skeletonWidth: "w-28" },
          { key: "unread", label: t("supportUnread"), align: "right", skeletonWidth: "w-10" },
          { key: "status", label: t("supportStatusColumn"), skeletonWidth: "w-20", skeletonShape: "badge" },
          { key: "last", label: t("supportLastMessage"), align: "right", className: "pr-5", skeletonWidth: "w-28" },
        ]}
        emptyText={t("supportEmpty")}
        emptyTitle={t("supportEmptyTitle")}
        emptyBadge={LifeBuoy}
        noMatchesText={t("supportEmpty")}
        noMatchesTitle={t("supportEmptyTitle")}
        filtered={status !== "open" || audience !== undefined}
        rows={requests.map((request) => ({
          key: request.threadId,
          primary: (
            // @ts-expect-error — Task 9 adds the `/admin/support/$threadId` route; this
            // link is correct today, the route just does not exist in the tree yet.
            // Delete this suppression once `routes/admin/support.$threadId.tsx` lands.
            <Link to="/admin/support/$threadId" params={{ threadId: request.threadId }} className="grid gap-0.5 no-underline">
              <span className="type-body-medium truncate">{request.subject}</span>
              <span className="type-caption truncate text-[var(--color-muted-foreground)]">
                {request.lastMessagePreview}
              </span>
            </Link>
          ),
          cells: {
            who:
              request.audience === "provider" ? (
                request.providerId ? (
                  <Link to="/admin/providers/$providerId" params={{ providerId: request.providerId }}>
                    {request.providerName}
                  </Link>
                ) : (
                  // An orphaned provider request — the provider it named no
                  // longer resolves to an id. Falling back to the requester's
                  // name would misattribute the row to the wrong person, so
                  // this shows the provider's own (unlinked) name, or a dash
                  // if even that degraded to empty.
                  <span>{request.providerName || "—"}</span>
                )
              ) : (
                <span>{request.requesterName}</span>
              ),
            // Blank, not "0": an unread count of none reads faster as an
            // empty cell than as a zero sitting among genuine counts.
            unread: <span className="tabular-nums">{request.unreadForAdmin || ""}</span>,
            status: (
              <Badge tone={request.status === "open" ? "info" : "neutral"}>
                {t(`supportStatus.${request.status}`)}
              </Badge>
            ),
            last: (
              <span className="tabular-nums text-[var(--color-muted-foreground)]">
                {when.format(new Date(request.lastMessageAt))}
              </span>
            ),
          },
        }))}
      />

      {hasMore && (
        <Button variant="outline" size="sm" className="justify-self-center" onClick={loadMore}>
          {t("supportLoadMore")}
        </Button>
      )}
    </div>
  );
}
