import { useTranslation } from "react-i18next";
import { cn } from "@ntizo/frontend-ui";

/** The three pages of checkout, in the order a customer walks them. */
export const CHECKOUT_STEPS = ["when", "details", "confirm"] as const;

export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

const LABEL_KEY: Record<CheckoutStep, string> = {
  when: "stepWhen",
  details: "stepDetails",
  confirm: "stepConfirm",
};

/**
 * Where the customer is in checkout — three named steps, not a bare
 * progress bar.
 *
 * Named, because the two steps ahead are the answer to the question somebody
 * halfway through a purchase is actually asking: how much more is there, and
 * is it going to ask me for anything I do not have to hand. A filled bar
 * answers neither.
 *
 * Not clickable. The steps are not a navigation: step 2 and step 3 are
 * addressed by a booking id that does not exist until step 1 is finished, so
 * a link to them would be a link to nothing for most of the flow. Going back
 * is what the browser's own back button and the "back to the service" link
 * are for.
 *
 * The "Step 1 of 3" sentence is rendered for screen readers only, and the
 * marker digits are hidden from them: read aloud, a row of "1 2 3" beside
 * three labels is noise, where one sentence naming the position is the whole
 * fact.
 *
 * The connectors shrink below `sm`. The row lives in the checkout header, and
 * at 390px the three Portuguese names with 24px lines between them came to a
 * few pixels more than the shell — which put "3 Confirmar" alone on a third
 * line under the logo. Halving the lines is what fits, and the names are the
 * part worth keeping. A language whose names are longer still wraps, which
 * `flex-wrap` handles; nothing overflows.
 */
export function CheckoutSteps({ current }: { current: CheckoutStep }) {
  const { t } = useTranslation("checkout");
  const currentIndex = CHECKOUT_STEPS.indexOf(current);

  return (
    <nav aria-label={t("stepsLabel")}>
      <p className="sr-only">
        {t("stepOf", { current: currentIndex + 1, total: CHECKOUT_STEPS.length })}
      </p>
      <ol className="flex list-none flex-wrap items-center gap-1.5 p-0 sm:gap-2">
        {CHECKOUT_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li key={step} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  active || done
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
                )}
              >
                {index + 1}
              </span>
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "type-caption",
                  active ? "font-semibold" : "text-[var(--color-muted-foreground)]",
                )}
              >
                {t(LABEL_KEY[step])}
              </span>
              {index < CHECKOUT_STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="mx-0.5 h-px w-3 bg-[var(--color-border)] sm:mx-1 sm:w-6"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
