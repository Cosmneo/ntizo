import { useTranslation } from "react-i18next";
import {
  Activity,
  CalendarCheck,
  Clock,
  DollarSign,
  Star,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@ntizo/frontend-ui";
import { usePageHeader } from "@/shared/lib/page-header";
import { useActiveProvider } from "../hooks/use-active-provider";

export function OverviewPage() {
  const { t } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();

  usePageHeader(
    activeProvider?.name ?? t("overview"),
    "Welcome back. Here's your overview.",
  );

  if (!activeProvider) {
    return (
      <p className="text-muted-foreground">{t("noActiveProvider")}</p>
    );
  }


  return (
    <div className="flex flex-col gap-6">
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

