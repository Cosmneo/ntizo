import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Who owns the bottom edge of a phone screen.
 *
 * A tab bar creates a collision the app has not had to answer: a dirty form
 * wants a save bar there, an open thread wants a composer, a booking waiting
 * on a decision wants Accept and Decline. Stacked on the tab bar that is
 * 112px of chrome on a 390px screen and two competing primary actions. So:
 * one bar, and the task wins. The tab bar is the resting state and stands
 * down whenever something claims the edge.
 *
 * A counter, not a boolean. Two claimants on one screen — a composer and a
 * decision bar in some future detail page — must not release the edge when
 * the first of them unmounts.
 *
 * `StickyActionBar` itself stays in `@ntizo/frontend-ui` and knows nothing
 * of this: a UI-package component cannot reach a web-app context and should
 * not want to. The console wraps it once, as `ConsoleActionBar`.
 */
interface BottomEdge {
  owned: boolean;
  /** Claim the edge. Returns the release. */
  claim: () => () => void;
}

const Ctx = createContext<BottomEdge | null>(null);

export function BottomEdgeProvider({ children }: { children: ReactNode }) {
  const [claims, setClaims] = useState(0);
  const claim = useCallback(() => {
    setClaims((n) => n + 1);
    return () => setClaims((n) => n - 1);
  }, []);
  const value = useMemo(() => ({ owned: claims > 0, claim }), [claims, claim]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBottomEdgeOwned(): boolean {
  return useContext(Ctx)?.owned ?? false;
}

/** Call from anything that puts its own bar at the bottom of the screen. */
export function useOwnsBottomEdge(): void {
  const claim = useContext(Ctx)?.claim;
  useEffect(() => {
    if (!claim) return;
    return claim();
  }, [claim]);
}
