import { createFileRoute } from "@tanstack/react-router";
import { BecomeProviderPage } from "@/features/become-provider/ui/become-provider-page";

/**
 * Public, and outside `_customer` on purpose.
 *
 * The person this page exists for has not signed up, so a route behind the
 * session guard would be reachable only by people who no longer need
 * persuading. It also has to be crawlable — it is the top of the funnel.
 */
export const Route = createFileRoute("/become-provider")({
  component: BecomeProviderPage,
});
