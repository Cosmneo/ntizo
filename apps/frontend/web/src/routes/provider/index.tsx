import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasAnyProvider } from "@/features/provider/viewmodel/use-providers";

export const Route = createFileRoute("/provider/")({
  beforeLoad: async () => {
    // Decide first, redirect after. redirect() throws a Response whose target
    // lives at `.options.to`, so a try/catch wrapped around the throw can't
    // tell it apart from a real failure — the previous version caught its own
    // redirect and sent every provider owner to /no-provider. Keeping the
    // throw outside the try removes that failure mode entirely.
    const hasProvider = await hasAnyProvider();
    throw redirect({
      to: hasProvider ? "/provider/overview" : "/provider/no-provider",
    });
  },
});
