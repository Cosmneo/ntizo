import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Zone } from "@/shared/lib/zones";
import { accessibleZones } from "@/shared/lib/zones";
import { fetchCurrentUser } from "@/shared/lib/api/me";
import { useMyProviders } from "@/features/provider/viewmodel/use-providers";

const ZONE_META: Record<Zone, { label: string; to: string }> = {
  landing: { label: "Landing", to: "/" },
  provider: { label: "Provider", to: "/provider" },
  admin: { label: "Admin", to: "/admin" },
};

/** Pure presentational piece — unit-tested without data hooks. */
export function ZoneLinks({ zones, current }: { zones: Zone[]; current: Zone }) {
  return (
    <nav className="flex items-center gap-1" aria-label="Zone switcher">
      {zones.map((z) => (
        <Link
          key={z}
          to={ZONE_META[z].to}
          data-active={z === current}
          className="rounded-md px-3 py-1.5 text-sm data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
        >
          {ZONE_META[z].label}
        </Link>
      ))}
    </nav>
  );
}

export function ZoneSwitcher({ current }: { current: Zone }) {
  const { data: me = null } = useQuery({ queryKey: ["me"], queryFn: fetchCurrentUser });
  const { data: providers = [] } = useMyProviders();
  const zones = accessibleZones(me, providers.length);
  return <ZoneLinks zones={zones} current={current} />;
}
