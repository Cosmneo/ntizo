import { useTranslation } from "react-i18next";
import {
  Activity,
  CalendarCheck,
  Clock,
  DollarSign,
  Percent,
  Star,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@ntizo/frontend-ui";
import { usePageHeader } from "@/shared/lib/page-header";
import { useActiveProvider } from "../viewmodel/use-active-provider";
import { useProviderDetail } from "../viewmodel/use-providers";

/**
 * 1200 -> "12%". Raw basis points arrive off `provider.byId`
 * (`ProviderDetail.commissionBps`) precisely so they can never be
 * pre-formatted upstream; `Intl.NumberFormat`'s own percent style is what
 * turns the integer into something readable, in whichever locale is active,
 * rather than a division and a concatenated "%" that would ignore locale
 * separators entirely.
 */
function formatCommissionRate(bps: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(bps / 10_000);
}

export function OverviewPage() {
  const { t, i18n } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();
  const { data: detail } = useProviderDetail(activeProvider?.id);

  usePageHeader(
    activeProvider?.name ?? t("overview"),
    "Welcome back. Here's your overview.",
  );

  if (!activeProvider) {
    return <p className="text-muted-foreground">{t("noActiveProvider")}</p>;
  }

  const commissionRate =
    detail?.commissionBps == null
      ? null
      : formatCommissionRate(
          detail.commissionBps,
          i18n.resolvedLanguage ?? i18n.language,
        );

  return (
    <div className="flex flex-col gap-6">
      {/*
        Its own row, ahead of the metrics grid below -- not one tile among
        that grid's six, which are still zeroed-out placeholders. `/provider`
        redirects here on every sign-in, before a slug ever reaches
        `/services`, which is what lets this screen keep the Terms' promise
        that the rate is shown "before they list a service": a provider
        passes through here first, every time, not only once during setup.
      */}
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <span className="text-xs font-medium text-muted-foreground">
              {t("commissionRateLabel")}
            </span>
            <div className="mt-1 text-3xl font-bold text-primary">
              {commissionRate ?? "—"}
            </div>
          </div>
          <Percent className="h-5 w-5 text-muted-foreground" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Active services"
          value="0"
          hint="published"
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Bookings"
          value="0"
          hint="this month"
          icon={<CalendarCheck className="h-4 w-4" />}
        />
        <StatCard
          label="In progress"
          value="0"
          hint="being delivered"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Completed"
          value="0"
          hint="all-time"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Revenue"
          value="$0"
          hint="last 30 days"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <StatCard
          label="Rating"
          value="—"
          hint="from reviews"
          icon={<Star className="h-4 w-4" />}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="mt-3 text-3xl font-bold text-primary">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}
