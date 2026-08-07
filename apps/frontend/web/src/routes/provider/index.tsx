import { createFileRoute, redirect } from "@tanstack/react-router";
import { providerQueries } from "@/features/provider/data/provider.repository";
import type { ProviderSummary } from "@/features/provider/domain/types";

export const Route = createFileRoute("/provider/")({
  beforeLoad: async () => {
    // Decide first, redirect after. redirect() throws a Response whose target
    // lives at `.options.to`, so a try/catch wrapped around the throw can't
    // tell it apart from a real failure — the previous version caught its own
    // redirect and sent every provider owner to /no-provider. Keeping the
    // throw outside the try removes that failure mode entirely.
    //
    // This runs in a route `beforeLoad`, not a React context, so it calls the
    // repository's queryFn directly rather than a hook. queryOptions() types
    // queryFn against TanStack Query's QueryFunctionContext parameter, which
    // this call site never supplies — same cast the repository's own test
    // uses.
    let hasProvider = false;
    try {
      const queryFn = providerQueries.mine().queryFn as () => Promise<
        ProviderSummary[]
      >;
      hasProvider = (await queryFn()).length > 0;
    } catch {
      hasProvider = false;
    }
    throw redirect({
      to: hasProvider ? "/provider/overview" : "/provider/no-provider",
    });
  },
});
