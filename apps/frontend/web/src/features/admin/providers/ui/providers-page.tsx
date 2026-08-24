import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { Avatar, AvatarFallback, Badge } from "@ntizo/frontend-ui";
import { ProviderStatus } from "@ntizo/shared";
import { CollectionCard } from "@/shared/components/collection-card";
import { initialsFrom } from "@/shared/lib/initials";
import { ProvidersFilterSheet } from "./providers-filters";
import { usePageHeader } from "@/shared/lib/page-header";
import { useAdminProviders } from "../viewmodel/use-admin-providers";
import { formatCommission, type AdminProvider } from "../domain/types";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  [ProviderStatus.Active]: "success",
  [ProviderStatus.Pending]: "warning",
  [ProviderStatus.Rejected]: "danger",
  [ProviderStatus.Suspended]: "danger",
  [ProviderStatus.Archived]: "info",
};

/**
 * Every business on the platform.
 *
 * The same card as the workspace's people list — literally the same component,
 * so the header, the count, the search box and the table chrome cannot drift
 * apart. What differs is the columns, because the two lists answer different
 * questions and a component that rendered both would need a prop for every
 * difference until it described nothing.
 *
 * Search and status go to the server rather than filtering an array here. This
 * is the one list with no ceiling on its size, and "which fifty of ten thousand
 * to draw" is not a decision the browser can make.
 */
export function AdminProvidersPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = useAdminProviders({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(status ? { status } : {}),
  });

  usePageHeader(t("providersTitle"), t("providersSubtitle"));

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {query.error && (
        <p className="type-body text-[var(--color-destructive)]">
          {t("providersError")}
        </p>
      )}

      <CollectionCard
        title={t("providersTitle")}
        shown={rows.length}
        total={rows.length}
        loading={query.isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("providersSearchPlaceholder")}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={status ? 1 : 0}
        columns={[
          { key: "business", label: t("providersBusiness"), className: "pl-5" },
          { key: "owner", label: t("providersOwner"), skeletonWidth: "w-44" },
          {
            key: "status",
            label: t("providersStatus"),
            skeletonWidth: "w-20",
            skeletonShape: "badge",
          },
          {
            key: "commission",
            label: t("providersCommission"),
            align: "right",
            skeletonWidth: "w-12",
          },
          {
            key: "applied",
            label: t("providersApplied"),
            align: "right",
            className: "pr-5",
            skeletonWidth: "w-24",
          },
        ]}
        emptyText={t("providersEmpty")}
        emptyTitle={t("providersEmptyTitle")}
        emptyBadge={Store}
        noMatchesText={t("providersNoMatches")}
        noMatchesTitle={t("providersNoMatchesTitle")}
        filtered={search.trim() !== "" || status !== ""}
        rows={rows.map((provider) => ({
          key: provider.id,
          primary: <Business provider={provider} />,
          cells: {
            owner: (
              <span className="block max-w-[26ch] truncate">
                {provider.ownerEmail ?? "—"}
              </span>
            ),
            status: (
              <Badge tone={STATUS_TONE[provider.status] ?? "info"}>
                {t(`providerStatus.${provider.status}`)}
              </Badge>
            ),
            commission: (
              <span className="tabular-nums">
                {formatCommission(provider.commissionBps, locale)}
              </span>
            ),
            applied: (
              <span className="tabular-nums text-[var(--color-muted-foreground)]">
                {dateFormat.format(new Date(provider.createdAt))}
              </span>
            ),
          },
        }))}
      />

      <ProvidersFilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        status={status}
        onStatusChange={setStatus}
      />
    </div>
  );
}

/** Who the row is about: the icon, the name, and where they are. */
function Business({ provider }: { provider: AdminProvider }) {
  return (
    <div className="flex items-center gap-3">
      {/* Initials rather than a type icon. A briefcase against a person told
          you what kind of provider it was — which is already in the row, and
          is not what somebody scanning a queue is looking for. A monogram
          gives each business a shape you can find again, and it is what the
          workspace's people list already shows. */}
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="text-xs">
          {initialsFrom(provider.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        {/* A link now that there is somewhere to go. Every row here ends in the
            same question — "what else does this business look like" — and until
            the detail screen existed this was deliberately plain text, because
            a link to nowhere is a control that lies about being one. */}
        <Link
          to="/admin/providers/$providerId"
          params={{ providerId: provider.id }}
          className="type-body-medium block truncate font-semibold hover:underline"
        >
          {provider.name}
        </Link>
        <p className="type-caption truncate text-[var(--color-muted-foreground)]">
          {[provider.city, provider.country].filter(Boolean).join(", ") ||
            provider.slug}
        </p>
      </div>
    </div>
  );
}

