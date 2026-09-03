import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/shared/lib/i18n";
import { AboutPage } from "@/features/company/ui/about-page";

/**
 * Top level, not under `_public`, for the reason `/privacy` gives: `_public`
 * redirects anyone with a session away, and the signed-in are exactly who
 * reads this. `ssr: true` because it is the kind of page a crawler indexes.
 */
export const Route = createFileRoute("/about")({
  ssr: true,
  head: () => ({ meta: [{ title: `${i18n.t("about.headTitle", { ns: "company" })} · Ntizo` }] }),
  component: AboutPage,
});
