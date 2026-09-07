import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { Badge, Button } from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { useAdminSupport, useSupportOpenCount } from "@/features/admin/support/viewmodel/use-admin-support";
import type { AdminSupportSearch } from "@/features/admin/support/data/admin-support.repository";
import {
  DEFAULT_SUPPORT_FILTERS,
  SupportFilterSheet,
  supportFilterCount,
  type SupportFilters,
} from "./support-filters";

/**
 * The support queue: what people asked the platform, and what is still open.
 *
 * Open by default — the queue is worked, not browsed — the same posture
 * `/admin/contact` takes. The two queues are deliberately separate: contact
 * requests arrive from anonymous forms and are answered by email; these are
 * threads with signed-in people and are answered here.
 *
 * The same card and the same filter panel as every other list here. The
 * search is over the subject, on the server, which is what a request is
 * found by in a list of open ones.
 */
export function AdminSupportPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const [filters, setFilters] = useState<SupportFilters>(DEFAULT_SUPPORT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { status, audience } = filters;

  const input: AdminSupportSearch = {
    ...(status ? { status } : {}),
    ...(audience ? { audience } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  };
  const { requests, loading, hasMore, loadMore, errorCode } = useAdminSupport(input);
  const openCount = useSupportOpenCount();

  usePageHeader(t("supportTitle"), t("supportSubtitle"));

  /**
   * The whole the card's "N of M shown" counts against.
   *
   * `supportRequests` is cursor-paged and never returns a count, so the list
   * cannot say how long it is. While the queue is on open requests, though,
   * the platform's open count *is* that whole — before the audience or the
   * search narrows it — and it is the number this screen exists to bring
   * down. Off "open" there is no such number, and the card says "N shown"
   * rather than claim one.
   */
  const whole = status === "open" ? openCount.data : undefined;

  const when = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {errorCode && <p className="type-body text-[var(--color-destructive)]">{t("supportError")}</p>}

      <CollectionCard
        title={t("supportTitle")}
        shown={requests.length}
        total={whole ?? requests.length}
        totalUnknown={whole === undefined && hasMore}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("supportSearchPlaceholder")}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={supportFilterCount(filters)}
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
        noMatchesText={t("supportNoMatches")}
        noMatchesTitle={t("supportNoMatchesTitle")}
        filtered={supportFilterCount(filters) > 0 || search.trim() !== ""}
        rows={requests.map((request) => ({
          key: request.threadId,
          primary: (
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

      <SupportFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} filters={filters} onChange={setFilters} />

      {hasMore && (
        <Button variant="outline" size="sm" className="justify-self-center" onClick={loadMore}>
          {t("supportLoadMore")}
        </Button>
      )}
    </div>
  );
}
