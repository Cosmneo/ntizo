import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";

/**
 * The floating way in.
 *
 * `bottom-20 md:bottom-6`: `MobileNav` is 56px of fixed bar at the bottom of
 * every customer page on a phone, and a launcher at `bottom-6` sits on top of
 * it. `z-30` keeps it under the open panel's own backdrop (`z-50`).
 *
 * `raised` is for the two browse pages, which draw a floating filter capsule
 * in the same band. The capsule is centred and sized to its content — at
 * 390px "Filters · Sort: Suggested" is nearly the width of the screen — so
 * its right edge runs under this button. Both are `fixed` and neither can
 * measure the other, which is why the page says which is which rather than
 * anything trying to detect it. The offset clears the capsule's own height,
 * so the launcher sits above it instead of on it.
 */
export function HelpLauncher({
  unreadCount,
  onOpen,
  raised = false,
}: {
  unreadCount: number;
  onOpen: () => void;
  /** Sit above the browse pages' floating filter capsule. */
  raised?: boolean;
}) {
  const { t } = useTranslation("help");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("launcher")}
      className={[
        "fixed right-4 z-30 grid h-12 w-12 place-items-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg md:right-6",
        raised
          ? // The capsule's own bottom (nav + inset + 1rem) plus its height
            // and a gap. `md:` drops the nav from the sum, exactly as
            // `FloatingControls` does at the same breakpoint.
            "bottom-[calc(3.5rem+env(safe-area-inset-bottom)+5rem)] md:bottom-[7rem]"
          : "bottom-20 md:bottom-6",
      ].join(" ")}
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
