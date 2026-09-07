import type { ReactNode } from "react";

/**
 * One navy capsule, centred above the customer bottom bar.
 *
 * `MobileNav` is rendered on every route by the root layout and is
 * `fixed bottom-0 z-40 md:hidden` — 3.5rem tall plus the safe-area inset. The
 * full-width bars this replaces learned that the hard way: a control sitting
 * at `bottom-0` of its own was painted over completely by that nav and could
 * not be pressed at all, on any phone. The offset below clears it by that
 * same height, and carries the same safe-area inset the nav does, so the two
 * never overlap by the height of the iOS home indicator either.
 *
 * `md:bottom-6`, not the taller calc: `MobileNav` is itself hidden from `md`
 * up, so between `md` and `lg` — where this still shows, see `lg:hidden`
 * below — there is nothing left to clear and the capsule can sit at a plain
 * rest distance from the edge.
 *
 * No spacer div underneath it, unlike the full-width bars it replaces: the
 * capsule is narrow and centred rather than a strip the height of the screen,
 * so it never sits over the last card or the pager the way a full-width bar
 * would.
 */
export function FloatingControls({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="floating-controls"
      className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] left-1/2 z-30 inline-flex -translate-x-1/2 items-center divide-x divide-[color:rgba(255,255,255,.22)] rounded-full bg-[var(--color-navy-surface)] p-[5px] text-[var(--color-navy-on)] shadow-[0_10px_26px_-8px_rgba(0,36,76,.55)] md:bottom-6 lg:hidden"
    >
      {children}
    </div>
  );
}

/**
 * The class each control inside `FloatingControls` carries.
 *
 * `whitespace-nowrap`, because the capsule sizes to its content rather than
 * to a fixed width — a control that wrapped onto two lines would grow the
 * whole capsule taller than the ones either side of it.
 *
 * The hover is white at a tenth rather than any token: this ground is navy,
 * and every grey a control brings with it from the page — `--color-muted`,
 * `--color-secondary` — is a pale patch on it. Lightening what is already
 * there is the only tint that works on a surface the control does not own.
 */
export function floatingControlClass(): string {
  return "inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-[14px] font-semibold hover:bg-white/10";
}
