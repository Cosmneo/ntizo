import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Zone } from "@/shared/lib/zones";
import { accessibleZones } from "@/shared/lib/zones";
import { useCurrentUser } from "@/features/user/viewmodel/use-current-user";
import { useMyProviders } from "@/features/provider/viewmodel/use-providers";

const ZONE_META: Record<Zone, { labelKey: string; to: string }> = {
  landing: { labelKey: "zoneCustomer", to: "/" },
  provider: { labelKey: "zoneProvider", to: "/provider" },
  admin: { labelKey: "zoneAdmin", to: "/admin" },
};

/** Pure presentational piece — unit-tested without data hooks. */
export function ZoneLinks({ zones, current }: { zones: Zone[]; current: Zone }) {
  const { t } = useTranslation("common");

  // Admin is deliberately not a segment. It is an occasional destination for a
  // handful of people, whereas this control is the everyday customer/provider
  // toggle; it lives in the account menu instead.
  const segments = zones.filter((z) => z !== "admin");

  // One segment is not a choice. A lone "Customer" pill would sit in the
  // header of every plain customer's screen implying a switch that does not
  // exist, so the control appears only once there is somewhere to switch to.
  if (segments.length < 2) return null;

  return (
    <nav
      aria-label={t("zoneSwitcher")}
      className="inline-flex items-center gap-0.5 rounded-full bg-[var(--color-muted)] p-1"
    >
      {segments.map((z) => (
        <Link
          key={z}
          to={ZONE_META[z].to}
          data-active={z === current}
          className={[
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
            "data-[active=true]:bg-[var(--color-background)]",
            "data-[active=true]:text-[var(--color-foreground)]",
            "data-[active=true]:shadow-sm",
          ].join(" ")}
        >
          {t(ZONE_META[z].labelKey)}
        </Link>
      ))}
    </nav>
  );
}

export function ZoneSwitcher({ current }: { current: Zone }) {
  const { data: me = null } = useCurrentUser();
  const { data: providers = [] } = useMyProviders();
  const zones = accessibleZones(me, providers.length);
  return <ZoneLinks zones={zones} current={current} />;
}
