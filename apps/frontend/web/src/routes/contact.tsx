import { createFileRoute } from "@tanstack/react-router";
import i18n from "@/shared/lib/i18n";
import { ContactRequestPage } from "@/features/company/ui/contact-request-page";

/** Top level, outside `_public`, like `/about` — the signed-in write too. */
export const Route = createFileRoute("/contact")({
  ssr: true,
  head: () => ({ meta: [{ title: `${i18n.t("contact.headTitle", { ns: "company" })} · Ntizo` }] }),
  component: () => <ContactRequestPage kind="contact" />,
});
