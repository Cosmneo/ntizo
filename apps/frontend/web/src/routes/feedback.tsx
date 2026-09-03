import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/shared/lib/i18n";
import { ContactRequestPage } from "@/features/company/ui/contact-request-page";

/** Top level, outside `_public`, like `/about` — the signed-in write too. */
export const Route = createFileRoute("/feedback")({
  ssr: true,
  /**
   * The page the visitor came from, carried as `?from=` by the links that
   * lead here. Declared so the router types it and `Link` can carry it — it
   * is not trusted on the way out: `isSafeInternalPath` gates it before it
   * becomes `originPath`.
   */
  validateSearch: (search: Record<string, unknown>): { from?: string } =>
    typeof search["from"] === "string" ? { from: search["from"] } : {},
  head: () => ({ meta: [{ title: `${i18n.t("feedback.headTitle", { ns: "company" })} · Ntizo` }] }),
  component: () => <ContactRequestPage kind="feedback" />,
});
