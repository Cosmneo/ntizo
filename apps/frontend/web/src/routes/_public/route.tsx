import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "@/shared/lib/api/auth-client";
import { fetchCurrentUser } from "@/shared/lib/api/me";
import { shouldBypassPublicRedirect } from "@/shared/lib/public-redirect";
import { resolvePostLoginDestination } from "@/shared/lib/zones";

export const Route = createFileRoute("/_public")({
  beforeLoad: async ({ location }) => {
    if (shouldBypassPublicRedirect(location.pathname)) return;
    const { data: session } = await authClient.getSession();
    if (session) {
      const me = await fetchCurrentUser();
      throw redirect({ to: resolvePostLoginDestination(me, null) });
    }
  },
  component: () => <Outlet />,
});
