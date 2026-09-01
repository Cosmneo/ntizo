import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Timer } from "lucide-react";

/** Milliseconds left on the hold, floored at zero and never `NaN`. */
function remainingFrom(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : 0;
}

/**
 * `MM:SS`, rounded up.
 *
 * Up, not down: a thirty-minute hold reads "30:00" the instant it starts
 * rather than "29:59", and the display only reaches "00:00" at the moment
 * the hold is actually gone — which is the moment this component stops
 * showing it at all.
 */
function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * How long the draft's hold on the slot has left, driven by the booking's own
 * `expiresAt` rather than by a duration counted down in the browser.
 *
 * Reading the server's instant is what makes a refresh, a slow page, and a
 * backgrounded tab all harmless: every tick recomputes from the wall clock,
 * so a throttled interval loses accuracy for a second and never loses the
 * deadline. A local "30 minutes from mount" would drift away from the clock
 * the server will actually enforce, and the customer would find the slot gone
 * while the page still promised them four minutes.
 *
 * **Zero is a navigation, not a reading of `00:00`.** The slot has been
 * released by then; leaving the customer on a page that still asks for their
 * address, under a timer that has stopped, is a form that cannot be
 * submitted and does not say so. So this sends them back to step 1 with the
 * service kept and a sentence explaining what happened, which is the same
 * answer the design's own failure table gives for "the draft's thirty minutes
 * ran out mid-flow".
 *
 * The navigation lives here rather than in a callback each step supplies for
 * itself: steps 2 and 3 would write the identical handler, and one of the two
 * copies is where it eventually stops matching the other.
 *
 * `role="timer"` rather than a bare paragraph, and deliberately not an
 * assertive live region: a screen reader announcing a new number every second
 * would drown out the form the customer is trying to fill in. `timer` is a
 * live region whose default is `off`, so the label names what this is and the
 * digits stay available to anyone who goes looking for them.
 *
 * Nothing mounts this on step 1 — there is no draft, and therefore no hold,
 * until step 1's own confirm creates one. It is built here because it belongs
 * to checkout rather than to any one of its pages, and because step 1 is
 * where the clock it reads is started.
 */
export function CheckoutCountdown({
  expiresAt,
  serviceId,
}: {
  /** ISO 8601, straight off the draft. */
  expiresAt: string;
  /** Which service to send the customer back to when the hold lapses. */
  serviceId: string;
}) {
  const { t } = useTranslation("checkout");
  const navigate = useNavigate();
  const [remainingMs, setRemainingMs] = useState(() => remainingFrom(expiresAt));

  useEffect(() => {
    setRemainingMs(remainingFrom(expiresAt));
    const id = setInterval(() => setRemainingMs(remainingFrom(expiresAt)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (remainingMs > 0) return;
    // `replace`, so the back button does not walk the customer into the page
    // whose hold has just lapsed.
    void navigate({
      to: "/book/$serviceId",
      params: { serviceId },
      search: { expired: true },
      replace: true,
    });
  }, [remainingMs, navigate, serviceId]);

  if (remainingMs <= 0) return null;

  return (
    <p
      role="timer"
      aria-label={t("holdRemainingLabel")}
      className="type-caption inline-flex items-center gap-1.5 rounded-full bg-[var(--color-muted)] px-3 py-1.5 font-semibold tabular-nums"
    >
      <Timer className="h-3.5 w-3.5" aria-hidden="true" />
      {t("holdRemaining", { time: formatRemaining(remainingMs) })}
    </p>
  );
}
