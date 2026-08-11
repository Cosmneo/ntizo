import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, User } from "lucide-react";
import { Badge, Select, Skeleton } from "@ntizo/frontend-ui";
import { ProviderStatus } from "@ntizo/shared";
import { CollectionCard } from "@/shared/components/collection-card";
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

      {/* The status filter sits beside the search rather than in a sheet: it is
          the queue's primary axis — "what is waiting for me" — and burying the
          question this screen exists to answer behind a panel would be a
          strange place to put it. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-56">
          <Select
            id="status"
            value={status}
            onChange={setStatus}
            ariaLabel={t("providersStatus")}
            options={[
              { value: "", label: t("providersAllStatuses") },
              ...Object.values(ProviderStatus).map((value) => ({
                value,
                label: t(`providerStatus.${value}`),
              })),
            ]}
          />
        </div>
      </div>

      <CollectionCard
        title={t("providersTitle")}
        shown={rows.length}
        total={rows.length}
        loading={query.isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("providersSearchPlaceholder")}
        columns={[
          { key: "business", label: t("providersBusiness"), className: "pl-5" },
          { key: "owner", label: t("providersOwner") },
          { key: "status", label: t("providersStatus") },
          {
            key: "commission",
            label: t("providersCommission"),
            align: "right",
          },
          {
            key: "applied",
            label: t("providersApplied"),
            align: "right",
            className: "pr-5",
          },
        ]}
        emptyText={t("providersEmpty")}
        noMatchesText={t("providersNoMatches")}
        filtered={search.trim() !== "" || status !== ""}
        skeletonRows={<RowSkeletons />}
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
    </div>
  );
}

/** Who the row is about: the icon, the name, and where they are. */
function Business({ provider }: { provider: AdminProvider }) {
  const Icon = provider.type === "organization" ? Building2 : User;
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        {/* Plain text, not a link. Every row here ends in the same question —
            "what else does this business look like" — but the detail screen
            does not exist yet, and a link to nowhere is a control that lies
            about being one. */}
        <p className="type-body-medium truncate font-semibold">
          {provider.name}
        </p>
        <p className="type-caption truncate text-[var(--color-muted-foreground)]">
          {[provider.city, provider.country].filter(Boolean).join(", ") ||
            provider.slug}
        </p>
      </div>
    </div>
  );
}

function RowSkeletons() {
  return (
    <>
      {Array.from({ length: 4 }, (_, i) => (
        <tr
          key={i}
          className="border-b border-[var(--color-border)] last:border-b-0"
        >
          <td className="py-3.5 pl-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-[var(--radius-card-sm)]" />
              <div className="grid gap-1.5">
                <Skeleton className="h-[19px] w-40" />
                <Skeleton className="h-[17px] w-28" />
              </div>
            </div>
          </td>
          <td className="py-3.5 pr-4">
            <Skeleton className="h-[19px] w-44" />
          </td>
          <td className="py-3.5 pr-4">
            <Skeleton className="h-[22px] w-20 rounded-full" />
          </td>
          <td className="py-3.5 pr-4">
            <Skeleton className="ml-auto h-[19px] w-12" />
          </td>
          <td className="py-3.5 pr-5">
            <Skeleton className="ml-auto h-[19px] w-24" />
          </td>
        </tr>
      ))}
    </>
  );
}
