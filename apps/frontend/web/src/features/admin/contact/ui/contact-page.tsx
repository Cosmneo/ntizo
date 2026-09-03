import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, MailOpen } from "lucide-react";
import type { ContactRequestKind, ContactRequestStatus } from "@ntizo/shared";
import type { ContactRequestAdminDTO } from "@ntizo/shared/read-models";
import { Badge, Button } from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { usePageHeader } from "@/shared/lib/page-header";
import { ADMIN_CONTACT_PAGE_SIZE } from "../data/admin-contact.repository";
import { useAdminContact, useSetContactRequestStatus } from "../viewmodel/use-admin-contact";

const KINDS: readonly ContactRequestKind[] = ["contact", "feedback"];

/**
 * The contact queue: what people wrote through the two forms, and whether
 * anybody has answered yet.
 *
 * On the `/admin/reviews` pattern. Open requests by default — the queue is
 * worked, not browsed — with kind and status filters and a search that also
 * matches the reference a person quoted back. A row expands to the whole
 * message and where it came from; the two actions are "reply by email" (a
 * mailto with the reference in the subject, because the reply happens in the
 * inbox, not here — spec, "What the context deliberately does not do") and
 * resolve/reopen. Support with an account is the help center's queue, at
 * `/admin/support`, not this one.
 */
export function AdminContactPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const [kind, setKind] = useState<ContactRequestKind | undefined>(undefined);
  const [status, setStatus] = useState<ContactRequestStatus | undefined>("open");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useAdminContact({
    offset,
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const setRequestStatus = useSetContactRequestStatus();

  usePageHeader(t("contactTitle"), t("contactSubtitle"));

  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const openCount = query.data?.openCount ?? 0;
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const topicLabel = (r: ContactRequestAdminDTO) => t(`topics.${r.kind}.${r.topic}`, { ns: "company", defaultValue: r.topic });

  function resetPage() {
    setOffset(0);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {query.error && <p className="type-body text-[var(--color-destructive)]">{t("contactError")}</p>}
      {setRequestStatus.error && <p className="type-body text-[var(--color-destructive)]">{t("contactStatusFailed")}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body">{t("contactOpenCount", { count: openCount })}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={kind === undefined ? "default" : "outline"} size="sm" onClick={() => { setKind(undefined); resetPage(); }}>
            {t("contactKindAll")}
          </Button>
          {KINDS.map((k) => (
            <Button key={k} variant={kind === k ? "default" : "outline"} size="sm" onClick={() => { setKind(k); resetPage(); }}>
              {t(`contactKind.${k}`)}
            </Button>
          ))}
          <span className="mx-1 hidden w-px bg-[var(--color-border)] sm:block" aria-hidden="true" />
          <Button variant={status === "open" ? "default" : "outline"} size="sm" onClick={() => { setStatus("open"); resetPage(); }}>
            {t("contactStatus.open")}
          </Button>
          <Button variant={status === "resolved" ? "default" : "outline"} size="sm" onClick={() => { setStatus("resolved"); resetPage(); }}>
            {t("contactStatus.resolved")}
          </Button>
          <Button variant={status === undefined ? "default" : "outline"} size="sm" onClick={() => { setStatus(undefined); resetPage(); }}>
            {t("contactStatusAll")}
          </Button>
        </div>
      </div>

      <CollectionCard
        title={t("contactTitle")}
        shown={rows.length}
        total={total}
        loading={query.isLoading}
        search={search}
        onSearchChange={(value) => { setSearch(value); resetPage(); }}
        searchPlaceholder={t("contactSearchPlaceholder")}
        columns={[
          { key: "request", label: t("contactRequest"), className: "pl-5" },
          { key: "kind", label: t("contactKindColumn"), skeletonWidth: "w-20", skeletonShape: "badge" },
          { key: "topic", label: t("contactTopic"), skeletonWidth: "w-28" },
          { key: "date", label: t("contactDate"), align: "right", skeletonWidth: "w-24" },
          { key: "actions", label: t("contactAction"), align: "right", className: "pr-5", skeletonWidth: "w-40" },
        ]}
        emptyText={t("contactEmpty")}
        emptyTitle={t("contactEmptyTitle")}
        emptyBadge={MailOpen}
        noMatchesText={t("contactNoMatches")}
        noMatchesTitle={t("contactNoMatchesTitle")}
        filtered={kind !== undefined || status !== "open" || search.trim() !== ""}
        rows={rows.map((r) => ({
          key: r.id,
          primary: (
            <RequestSummary
              request={r}
              expanded={expanded === r.id}
              onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
            />
          ),
          cells: {
            kind: <Badge tone={r.kind === "feedback" ? "info" : "neutral"}>{t(`contactKind.${r.kind}`)}</Badge>,
            topic: <span className="block max-w-[22ch] truncate">{topicLabel(r)}</span>,
            date: <span className="tabular-nums text-[var(--color-muted-foreground)]">{dateFormat.format(new Date(r.createdAt))}</span>,
          },
          actions: (
            <span className="flex items-center justify-end gap-2">
              {r.email && (
                <a
                  href={`mailto:${r.email}?subject=${encodeURIComponent(`[Ntizo #${r.reference}] ${topicLabel(r)}`)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold no-underline"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {t("contactReply")}
                </a>
              )}
              <Button
                variant={r.status === "open" ? "default" : "outline"}
                size="sm"
                disabled={setRequestStatus.isPending}
                onClick={() => setRequestStatus.mutate({ requestId: r.id, status: r.status === "open" ? "resolved" : "open" })}
              >
                {r.status === "open" ? t("contactResolve") : t("contactReopen")}
              </Button>
            </span>
          ),
        }))}
      />

      {total > ADMIN_CONTACT_PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - ADMIN_CONTACT_PAGE_SIZE))}>
            {t("contactPrevious")}
          </Button>
          <Button variant="outline" size="sm" disabled={offset + ADMIN_CONTACT_PAGE_SIZE >= total} onClick={() => setOffset((o) => o + ADMIN_CONTACT_PAGE_SIZE)}>
            {t("contactNext")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Who wrote, what they said (two lines, or all of it), and where from. */
function RequestSummary({ request, expanded, onToggle }: { request: ContactRequestAdminDTO; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation("admin");
  return (
    <div className="min-w-0">
      <p className="type-body-medium m-0 flex flex-wrap items-center gap-x-2 font-semibold">
        {request.name}
        <span className="type-caption font-mono text-[var(--color-muted-foreground)]">#{request.reference}</span>
      </p>
      <p className="type-caption m-0 text-[var(--color-muted-foreground)]">
        {request.email ?? t("contactNoEmail")} · {request.locale}
      </p>
      <p className={`type-caption mt-1 mb-0 whitespace-pre-wrap text-[var(--color-foreground)] ${expanded ? "" : "line-clamp-2"}`}>
        {request.message}
      </p>
      {expanded && (
        <dl className="type-caption mt-2 mb-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[var(--color-muted-foreground)]">
          <dt>{t("contactOrigin")}</dt><dd className="m-0">{request.originPath ?? "—"}</dd>
          <dt>{t("contactIp")}</dt><dd className="m-0">{request.ipAddress ?? "—"}</dd>
          <dt>{t("contactUserAgent")}</dt><dd className="m-0 break-all">{request.userAgent ?? "—"}</dd>
        </dl>
      )}
      <button type="button" onClick={onToggle} className="type-caption mt-1 font-semibold text-[var(--color-primary)]">
        {expanded ? t("contactHideDetails") : t("contactShowDetails")}
      </button>
    </div>
  );
}
