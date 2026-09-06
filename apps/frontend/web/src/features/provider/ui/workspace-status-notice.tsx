import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock } from "lucide-react";
import { useActiveProvider } from "../viewmodel/use-active-provider";
import { isWorkspaceLive } from "../domain/workspace-status";

/**
 * Why nothing this workspace publishes can be seen.
 *
 * It exists because the two halves of the product disagreed in silence. The
 * storefront hides every service whose provider is not `active`
 * (`conditionsFor`, `service-read.repository.ts`), and the provider console
 * said nothing about it — so a business could finish onboarding, build a
 * service, press Publish, be told it worked, and never appear anywhere. One
 * provider's only listing was lost exactly that way, and the workspace it
 * was published into had been sitting unapproved for ten days.
 *
 * Renders nothing at all for an approved workspace, which is almost every
 * load. A banner that is usually there is a banner nobody reads.
 *
 * Pending and suspended are told apart rather than folded into one "not
 * live" message: both mean invisible, but one is waiting on us and the other
 * is a decision already taken, and a provider can only act on the difference.
 */
export function WorkspaceStatusNotice() {
  const { t } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();

  if (!activeProvider || isWorkspaceLive(activeProvider.status)) return null;

  const suspended = activeProvider.status === "suspended";

  return (
    <div
      role="status"
      className={
        "flex items-start gap-3 rounded-[var(--radius-field)] px-4 py-3 " +
        (suspended
          ? "bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] text-[var(--color-destructive)]"
          : "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-foreground)]")
      }
    >
      {suspended ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div className="flex flex-col gap-0.5">
        <p className="type-body font-medium">
          {t(suspended ? "workspaceStatus.suspendedTitle" : "workspaceStatus.pendingTitle")}
        </p>
        <p className="type-body text-[var(--color-muted-foreground)]">
          {t(suspended ? "workspaceStatus.suspendedBody" : "workspaceStatus.pendingBody")}
        </p>
      </div>
    </div>
  );
}
