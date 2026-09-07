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
      {/* Initials rather than a type icon. A briefcase against a person told
          you what kind of provider it was — which is already in the row, and
          is not what somebody scanning a queue is looking for. A monogram
          gives each business a shape you can find again, and it is what the
          workspace's people list already shows. */}
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="text-xs">{initialsFrom(provider.name)}</AvatarFallback>
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
          {[provider.city, provider.country].filter(Boolean).join(", ") || provider.slug}
        </p>
      </div>
    </div>
  );
}
