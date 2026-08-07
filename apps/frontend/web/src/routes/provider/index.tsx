import { createFileRoute, redirect } from "@tanstack/react-router";
import { listMyProviders } from "@/features/provider/lib/provider-api";

export const Route = createFileRoute("/provider/")({
  beforeLoad: async () => {
    // Decide first, redirect after. redirect() throws a Response whose target
    // lives at `.options.to`, so a try/catch wrapped around the throw can't
    // tell it apart from a real failure — the previous version caught its own
    // redirect and sent every provider owner to /no-provider. Keeping the
    // throw outside the try removes that failure mode entirely.
    let hasProvider = false;
    try {
      hasProvider = (await listMyProviders()).length > 0;
    } catch {
      hasProvider = false;
    }
    throw redirect({
      to: hasProvider ? "/provider/overview" : "/provider/no-provider",
    });
  },
});
