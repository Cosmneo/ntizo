import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { Badge } from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { ProvidersFilterSheet } from "./providers-filters";
import { PROVIDER_STATUS_TONE, ProviderBusiness } from "./provider-row";
import { usePageHeader } from "@/shared/lib/page-header";
import { useAdminProviders } from "../viewmodel/use-admin-providers";
import { formatCommission } from "@/shared/domain/commission-format";

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
  // `strict: false`: this is a `ui` file and may not import the route to name
  // it. Only the arrival value — the filter sheet keeps its own state after.
  const arrived = useSearch({ strict: false }) as { status?: string };
  const [status, setStatus] = useState(arrived.status ?? "");
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
          primary: <ProviderBusiness provider={provider} />,
          cells: {
            owner: (
              <span className="block max-w-[26ch] truncate">
                {provider.ownerEmail ?? "—"}
              </span>
            ),
            status: (
              <Badge tone={PROVIDER_STATUS_TONE[provider.status] ?? "info"}>
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

