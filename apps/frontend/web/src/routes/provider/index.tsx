import { createFileRoute, redirect } from "@tanstack/react-router";
import { preferredProviderSlug } from "@/features/provider/viewmodel/use-providers";

export const Route = createFileRoute("/provider/")({
  beforeLoad: async () => {
    // Decide first, redirect after. redirect() throws a Response whose target
    // lives at `.options.to`, so a try/catch wrapped around the throw cannot
    // tell it apart from a real failure — the previous version caught its own
    // redirect and sent every provider owner to /no-provider. Keeping the
    // throw outside the try removes that failure mode entirely.
    const slug = await preferredProviderSlug();
    if (!slug) {
      // The wizard, not the two-button scaffold that stood here. It is what
      // "become a provider" promises, and the page that sends people here
      // spends five sections setting up that expectation.
      throw redirect({ to: "/onboarding" });
    }
    throw redirect({ to: "/provider/$slug/overview", params: { slug } });
  },
});
