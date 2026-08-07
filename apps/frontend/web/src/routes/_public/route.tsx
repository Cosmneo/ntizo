import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { resolveDestinationForSession } from "@/features/provider/viewmodel/post-login";
import { shouldBypassPublicRedirect } from "@/shared/lib/public-redirect";

export const Route = createFileRoute("/_public")({
  beforeLoad: async ({ location }) => {
    if (shouldBypassPublicRedirect(location.pathname)) return;
    const { data: session } = await authClient.getSession();
    if (session) {
      throw redirect({ to: await resolveDestinationForSession(null) });
    }
  },
  component: () => <Outlet />,
});
