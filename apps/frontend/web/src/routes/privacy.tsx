import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/features/legal/ui/legal-page";

/**
 * Top level, not under `_public`.
 *
 * `_public` redirects anyone with a session away from it, which is right for
 * a sign-in form and wrong for a policy: the people most likely to read this
 * are the ones who already have an account. Google also fetches this URL when
 * the OAuth app is published, and it must answer for a signed-out crawler.
 */
export const Route = createFileRoute("/privacy")({
  ssr: true,
  component: () => <LegalPage docKey="privacy" />,
});
