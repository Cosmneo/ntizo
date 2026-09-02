import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CheckoutSteps, type CheckoutStep } from "@/features/checkout/ui/checkout-steps";

/**
 * The bar above every checkout page: the logo, the steps, and a lock.
 *
 * Not `SiteHeader`. That one carries the public navigation pill, the bell and
 * the account menu — three invitations to go somewhere else, on the one page
 * where somewhere else costs a slot on hold. Checkout is a corridor: the
 * customer finishes it, or leaves by the back link or the logo. So the bar
 * says where in the corridor they are and that the purchase is secure, and
 * nothing else. The bottom bar on a phone is gone for the same reason — see
 * `zoneOwnsChrome`.
 *
 * The steps live here rather than in the page body. The body already has a
 * back link, a title and an intro above the first control, and a fourth thing
 * before the calendar pushed it down a screen on a phone. A sticky bar puts
 * the position where the eye glances for it and keeps it there while the form
 * scrolls.
 *
 * Three columns from `md`, for the reason `SiteHeader` gives: `mx-auto` on the
 * middle item centres it between two sides of different widths, so the steps
 * would sit a little off centre. Below `md` the steps take a second row of
 * their own, the whole width of it — the three markers spread across the
 * screen with their names underneath, which is `CheckoutSteps`' phone shape.
 *
 * Sticky from `md` only. On a phone the bar is two rows tall, and pinning
 * ninety-odd pixels to the top of a 660px viewport takes the calendar's
 * first row off the screen while the customer scrolls for a time. The rail's
 * own sticky offset only applies from `lg`, so nothing depends on the bar
 * staying put below that.
 */
export function CheckoutHeader({ current }: { current: CheckoutStep }) {
  const { t } = useTranslation("checkout");

  return (
    <header className="z-20 border-b border-[var(--color-border)] bg-[var(--color-background)] md:sticky md:top-0">
      <div className="page-shell grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-4 pt-3 pb-4 md:h-16 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:py-0">
        <Link to="/" className="col-start-1 row-start-1 justify-self-start">
          <img src="/brand/logo-primary.svg" alt="Ntizo" className="h-7" />
        </Link>

        <div className="col-span-2 row-start-2 w-full md:col-span-1 md:col-start-2 md:row-start-1 md:w-auto md:justify-self-center">
          <CheckoutSteps current={current} />
        </div>

        <p className="type-caption col-start-2 row-start-1 inline-flex items-center gap-1.5 justify-self-end font-semibold text-[var(--color-muted-foreground)] md:col-start-3">
          <Lock className="h-4 w-4" aria-hidden="true" />
          {t("secureCheckout")}
        </p>
      </div>
    </header>
  );
}
