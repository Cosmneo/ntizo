import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@ntizo/frontend-ui";
import { ProviderStatus } from "@ntizo/shared";
import { initialsFrom } from "@/shared/lib/initials";
import type { AdminProvider } from "../domain/types";

export const PROVIDER_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  [ProviderStatus.Active]: "success",
  [ProviderStatus.Pending]: "warning",
  [ProviderStatus.Rejected]: "danger",
  [ProviderStatus.Suspended]: "danger",
  [ProviderStatus.Archived]: "info",
};

/** Who the row is about: the icon, the name, and where they are. */
export function ProviderBusiness({ provider }: { provider: AdminProvider }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="text-xs">{initialsFrom(provider.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <Link
          to="/admin/providers/$providerId"
          params={{ providerId: provider.id }}
          className="type-body-medium block truncate font-semibold hover:underline"
        >
          {provider.name}
        </Link>
        <p className="type-caption truncate text-[var(--color-muted-foreground)]">
          {[provider.city, provider.country].filter(Boolean).join(", ") || provider.slug}
        </p>
      </div>
    </div>
  );
}
