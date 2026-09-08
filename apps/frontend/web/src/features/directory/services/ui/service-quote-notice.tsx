import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@ntizo/frontend-ui";
import { MessageProviderButton } from "@/features/directory/ui/provider-rail";
import { RailCard } from "@/features/directory/ui/rail-card";

/**
 * What a service priced by quote shows where a price panel would be.
 *
 * The panel used to be a dead end — one sentence and a way to start a
 * conversation — because there was nothing to send a request to. Now there is:
 * "Pedir orçamento" is the page's one filled button, and messaging keeps its
 * place underneath as text, because some people want to ask a question before
 * describing a whole job.
 *
 * `quoteForm` is null for a quote service whose provider never configured
 * one — the panel still works, it just says nothing about response time,
 * rather than reading a field off `null`. `responseHours` is the provider's
 * own promise, from the quote form they did configure. Shown before the
 * customer commits to typing, because a promise nobody sees is not one.
 */
export function ServiceQuoteNotice({
  serviceId,
  providerId,
  providerName,
  quoteForm,
}: {
  serviceId: string;
  providerId: string;
  providerName: string;
  quoteForm: { responseHours: number } | null;
}) {
  const { t } = useTranslation("quotes");

  return (
    <RailCard className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="type-h3">{t("entry.panelTitle")}</p>
        {quoteForm && (
          <p className="type-caption text-[var(--color-muted-foreground)]">
            {t("entry.respondsIn", { hours: quoteForm.responseHours })}
          </p>
        )}
      </div>

      <p className="type-body text-[var(--color-muted-foreground)]">
        {t("entry.panelBody", { provider: providerName })}
      </p>

      <Link
        to="/quote/$serviceId"
        params={{ serviceId }}
        className={buttonVariants({ className: "w-full" })}
      >
        {t("entry.action")}
      </Link>

      {/* `compact` is this component's own text-link treatment, which is what
          the mockup asks for here: messaging stops being a button the moment
          the page has a real primary action. */}
      <MessageProviderButton providerId={providerId} compact />
    </RailCard>
  );
}
