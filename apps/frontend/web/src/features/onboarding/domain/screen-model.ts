/**
 * Where the wizard is, and where it may go.
 *
 * Three phases, not the reference's four. Its fourth is a channel-manager
 * connection and we have no integrations to connect; its celebration becomes
 * our "under review", because registration now creates a pending provider and
 * a confetti screen would be telling someone they are live when they are not.
 *
 * Phase 1 is split into sub-steps so each screen asks one thing. A single form
 * with nine fields is the same work presented as a wall.
 */
export type OnboardingPhase = 1 | 2 | 3;
export type ProviderSubStep = "type" | "identity" | "location";

export type OnboardingScreen =
  | { phase: 1; sub: ProviderSubStep }
  | { phase: 2 }
  | { phase: 3 };

export const PROVIDER_SUB_ORDER: readonly ProviderSubStep[] = [
  "type",
  "identity",
  "location",
] as const;

export const FIRST_SCREEN: OnboardingScreen = { phase: 1, sub: "type" };

export function nextScreen(screen: OnboardingScreen): OnboardingScreen | null {
  if (screen.phase === 1) {
    const i = PROVIDER_SUB_ORDER.indexOf(screen.sub);
    const following = PROVIDER_SUB_ORDER[i + 1];
    return following ? { phase: 1, sub: following } : { phase: 2 };
  }
  if (screen.phase === 2) return { phase: 3 };
  // Phase 3 is terminal. What is left to do afterwards is done from the
  // dashboard, not by pushing the wizard further.
  return null;
}

export function previousScreen(screen: OnboardingScreen): OnboardingScreen | null {
  if (screen.phase === 1) {
    const i = PROVIDER_SUB_ORDER.indexOf(screen.sub);
    const preceding = PROVIDER_SUB_ORDER[i - 1];
    return preceding ? { phase: 1, sub: preceding } : null;
  }
  if (screen.phase === 2) return { phase: 1, sub: "location" };
  // No way back out of "under review": the provider exists by then, and
  // re-running creation would make a second one.
  return null;
}

/** `2 of 3` for the phase that has sub-steps, and nothing for the ones that do not. */
export function subProgress(
  screen: OnboardingScreen,
): { current: number; total: number } | null {
  if (screen.phase !== 1) return null;
  return {
    current: PROVIDER_SUB_ORDER.indexOf(screen.sub) + 1,
    total: PROVIDER_SUB_ORDER.length,
  };
}

/**
 * Whether the chip for a phase may be clicked from where the user is.
 *
 * Backwards only. Jumping forward would skip the step that creates the
 * provider, and everything after phase 1 needs one to exist — so a forward
 * chip is not a shortcut, it is a broken screen waiting to happen.
 */
export function isReachable(target: OnboardingScreen, from: OnboardingScreen): boolean {
  return target.phase <= from.phase;
}
