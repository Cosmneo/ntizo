import { useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ntizo/frontend-ui";
import { ProviderStatus } from "@ntizo/shared";
import type { ProviderBookingStatsDayDTO } from "@ntizo/shared/read-models";
import { ActivityChart } from "@/shared/components/activity-chart";
import { CollectionCard } from "@/shared/components/collection-card";
import { ConsolePage } from "@/shared/components/console/console-page";
import { CARD_LINK, StatCard } from "@/shared/components/stat-card";
import { greetingKey } from "@/shared/domain/greeting";
import { usePageHeader } from "@/shared/lib/page-header";
import { PROVIDER_STATUS_TONE, ProviderBusiness } from "@/features/admin/providers/ui/provider-row";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { formatMoney } from "@/features/wallet/domain/money";
import type { NeedsYouItem } from "../domain/needs-you";
import { useAdminStats, useLatestApplications, useNeedsYou } from "../viewmodel/use-admin-dashboard";

/**
 * The platform at a glance, in the order the spec fixes: what is owed, then
 * the thirty days, then who applied. The first row is verbs — every card on
 * it is a task — and it is absent on a quiet day rather than a row of zeros.
 * The tiles below carry no verb; they are readings.
 *
 * The provider's dashboard shows a workspace its share; this one shows the
 * platform the gross and what it kept, over the same bookings and the same
 * window, so the two never describe different money.
 */
export function DashboardPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const me = useCurrentUser();
  const stats = useAdminStats();
  const needs = useNeedsYou();
  const applications = useLatestApplications();

  // The instant the numbers were answered, as the provider Overview reasons.
  const now = useMemo(() => new Date(stats.dataUpdatedAt || Date.now()), [stats.dataUpdatedAt]);

  usePageHeader(
    t(`overview.greeting.${greetingKey(now)}`, { name: me.data?.firstName ?? "" }),
    t("overview.subtitle"),
  );

  const s = stats.data;
  const money = (minor: number) => formatMoney(minor, s?.currency ?? "MZN", locale);
  const rows = applications.data ?? [];
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <ConsolePage>
      {needs.failed && (
        <p role="alert" className="type-body text-[var(--color-destructive)]">
          {t("overview.loadError")}{" "}
          <button type="button" className="underline" onClick={needs.retry}>
            {t("overview.retry")}
          </button>
        </p>
      )}

      {needs.items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {needs.items.map((item) => (
            <StatCard
              key={item.key}
              label={t(`overview.needsYou.${item.key}`)}
              value={item.count}
              action={<NeedsYouLink item={item} label={t(`overview.needsYou.${item.key}Action`)} />}
            />
          ))}
        </div>
      )}

      {/* Two-up on a phone, four-up from `xl` — the provider Overview says why
          not `lg`. The two money tiles take the whole width below `sm`: the
          platform's gross is wider than any one workspace's revenue, and
          `StatCard`'s 18px phone step was sized for a workspace's. So on a phone
          the two counts pair up on one row and each sum gets a line of its own. */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label={t("overview.bookingsTitle")}
          value={s?.confirmedLast30 ?? 0}
          loading={stats.isLoading}
          hint={t("overview.bookingsHint", { count: s?.completedLast30 ?? 0 })}
        />
        <StatCard
          label={t("overview.newProvidersTitle")}
          value={s?.newProvidersLast30 ?? 0}
          loading={stats.isLoading}
        />
        <StatCard
          className="col-span-2 sm:col-span-1"
          label={t("overview.grossTitle")}
          value={money(s?.grossLast30Minor ?? 0)}
          loading={stats.isLoading}
          hint={s && s.completedLast30 === 0 ? t("overview.nothingCompleted") : t("overview.grossHint")}
        />
        <StatCard
          className="col-span-2 sm:col-span-1"
          label={t("overview.commissionTitle")}
          value={money(s?.commissionLast30Minor ?? 0)}
          loading={stats.isLoading}
          hint={t("overview.commissionHint")}
        />
      </div>

      <ActivityChart
        days={s?.perDay ?? []}
        locale={locale}
        labels={{
          title: t("overview.chartTitle"),
          range: t("overview.chartRange"),
          requests: t("overview.chartRequests"),
          confirmed: t("overview.chartConfirmed"),
          empty: t("overview.chartEmpty"),
          day: t("overview.chartTableDay"),
        }}
        dayLabel={(date, d: ProviderBookingStatsDayDTO) =>
          t("overview.chartDayLabel", { date, requests: d.requests, confirmed: d.confirmed })
        }
      />

      <CollectionCard
        title={t("overview.applicationsTitle")}
        shown={rows.length}
        total={rows.length}
        loading={applications.isLoading}
        columns={[
          { key: "business", label: t("overview.applicationsBusiness"), className: "pl-5" },
          { key: "status", label: t("overview.applicationsStatus"), skeletonWidth: "w-20", skeletonShape: "badge" },
          { key: "applied", label: t("overview.applicationsApplied"), align: "right", className: "pr-5", skeletonWidth: "w-24" },
        ]}
        rows={rows.map((provider) => ({
          key: provider.id,
          primary: <ProviderBusiness provider={provider} />,
          cells: {
            status: (
              <Badge tone={PROVIDER_STATUS_TONE[provider.status] ?? "info"}>
                {t(`providerStatus.${provider.status}`)}
              </Badge>
            ),
            applied: (
              <span className="tabular-nums text-[var(--color-muted-foreground)]">
                {dateFormat.format(new Date(provider.createdAt))}
              </span>
            ),
          },
        }))}
        emptyTitle={t("overview.applicationsEmptyTitle")}
        emptyText={t("overview.applicationsEmpty")}
        noMatchesTitle={t("overview.applicationsEmptyTitle")}
        noMatchesText={t("overview.applicationsEmpty")}
        // Nothing narrows this card — it is the newest five, always.
        filtered={false}
        action={
          <Link to="/admin/providers" className={CARD_LINK}>
            {t("overview.applicationsAll")}
          </Link>
        }
      />
    </ConsolePage>
  );
}

/** Each owed thing opens its own queue, already narrowed to what is owed. */
function NeedsYouLink({ item, label }: { item: NeedsYouItem; label: string }): ReactElement {
  switch (item.key) {
    case "disputed":
      return (
        <Link to="/admin/bookings" search={{ tab: "disputed" }} className={CARD_LINK}>
          {label}
        </Link>
      );
    case "providers":
      return (
        <Link to="/admin/providers" search={{ status: ProviderStatus.Pending }} className={CARD_LINK}>
          {label}
        </Link>
      );
    case "support":
      return (
        <Link to="/admin/support" className={CARD_LINK}>
          {label}
        </Link>
      );
    case "contact":
      return (
        <Link to="/admin/contact" className={CARD_LINK}>
          {label}
        </Link>
      );
  }
}
