import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";

/**
 * The floating way in.
 *
 * `bottom-20 md:bottom-6`: `MobileNav` is 56px of fixed bar at the bottom of
 * every customer page on a phone, and a launcher at `bottom-6` sits on top of
 * it. `z-30` keeps it under the open panel's own backdrop (`z-50`).
 */
export function HelpLauncher({ unreadCount, onOpen }: { unreadCount: number; onOpen: () => void }) {
  const { t } = useTranslation("help");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("launcher")}
      className="fixed right-4 bottom-20 z-30 grid h-12 w-12 place-items-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg md:right-6 md:bottom-6"
    >
      <HelpCircle aria-hidden="true" className="h-6 w-6" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-destructive)] px-1 text-[11px] font-semibold text-white">
          {unreadCount}
        </span>
      )}
    </button>
  );
}
