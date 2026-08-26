import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/features/legal/ui/legal-page";

/** Top level for the same reasons as `/privacy` — see the note there. */
export const Route = createFileRoute("/terms")({
  ssr: true,
  component: () => <LegalPage docKey="terms" />,
});
