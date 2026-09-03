import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/shared/lib/i18n";
import { HelpPage } from "@/features/help-center/ui/help-page";

/**
 * Top level and `ssr: true`, for the reason `/about` and `/privacy` give:
 * `_public` redirects anyone with a session away, and the signed-in read
 * this as often as anyone. Prerendered in `vite.config.ts` — the answers are
 * the same for everybody, and this is the page a search engine should find.
 */
export const Route = createFileRoute("/help")({
  ssr: true,
  head: () => ({ meta: [{ title: `${i18n.t("page.headTitle", { ns: "help" })} · Ntizo` }] }),
  component: HelpPage,
});
