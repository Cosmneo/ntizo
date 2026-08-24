import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { OnboardingPage } from "@/features/onboarding/ui/onboarding-page";

/**
 * The provider onboarding wizard, on its own.
 *
 * Deliberately NOT under `/provider`. That path is wrapped by `ProviderShell`,
 * whose sidebar offers Members and Settings — pages that need a provider to
 * exist, which is precisely what this flow has not created yet. It also offers
 * exits at the one moment in the app where leaving loses work.
 *
 * Signed in is the only requirement. Someone who already has a provider is not
 * redirected away: a second workspace is a legitimate thing to want, and the
 * account menu's "create new" sends them here.
 */
export const Route = createFileRoute("/onboarding")({
  beforeLoad: async ({ location }) => {
    const { data: session } = await authClient.getSession();
    if (!session?.user) {
      throw redirect({ to: "/sign-in", search: { next: location.pathname } });
    }
  },
  component: OnboardingPage,
});
