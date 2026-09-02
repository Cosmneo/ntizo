import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
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
 * One shape at every width, laid out two ways. A marker is a 28px circle:
 * filled with a tick once the step is done, filled with its number and a
 * soft halo while it is the one being taken, an outline with a grey number
 * ahead of that. Below `md` the three take the whole row — equal columns,
 * the name under each marker, one line running marker to marker that turns
 * blue as far as the customer has come. That line is drawn by each column
 * from its own marker's edge to the next column's, which is why it is
 * absolutely positioned rather than a flex sibling: a flex line between two
 * `flex-1` columns has no width of its own to claim. From `md` the same
 * markers sit in one row with the name beside each, joined by short fixed
 * connectors, which is the shape a 64px header bar has room for.
 *
 * The "Step 1 of 3" sentence is rendered for screen readers only, and the
 * marker digits and ticks are hidden from them: read aloud, a row of "1 2 3"
 * beside three labels is noise, where one sentence naming the position is
 * the whole fact.
 */
export function CheckoutSteps({ current }: { current: CheckoutStep }) {
  const { t } = useTranslation("checkout");
  const currentIndex = CHECKOUT_STEPS.indexOf(current);

  return (
    <nav aria-label={t("stepsLabel")}>
      <p className="sr-only">
        {t("stepOf", { current: currentIndex + 1, total: CHECKOUT_STEPS.length })}
      </p>
      <ol className="flex list-none items-start p-0 md:items-center md:gap-2">
        {CHECKOUT_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          const last = index === CHECKOUT_STEPS.length - 1;
          const lineClass = done
            ? "bg-[var(--color-primary)]"
            : "bg-[var(--color-border-strong)]";

          return (
            <li
              key={step}
              className="relative flex flex-1 flex-col items-center gap-1.5 md:flex-none md:flex-row md:gap-2"
            >
              {/* The phone's line to the next marker. `top` is the marker's
                  centre less half the line; the horizontal offsets are the
                  marker's radius plus a little air, measured from this
                  column's centre to the next one's. */}
              {!last && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-[13px] right-[calc(-50%+1.125rem)] left-[calc(50%+1.125rem)] h-0.5 rounded-full md:hidden",
                    lineClass,
                  )}
                />
              )}

              <span
                aria-hidden="true"
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular-nums",
                  done && "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
                  active &&
                    "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] ring-4 ring-[color:color-mix(in_srgb,var(--color-primary)_18%,transparent)]",
                  !done &&
                    !active &&
                    "border-2 border-[var(--color-border-strong)] bg-[var(--color-background)] text-[var(--color-muted-foreground)]",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
              </span>

              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "max-w-[7.5rem] text-center text-xs leading-tight md:max-w-none md:text-left md:text-sm",
                  active
                    ? "font-semibold text-[var(--color-foreground)]"
                    : done
                      ? "font-medium text-[var(--color-foreground)]"
                      : "font-medium text-[var(--color-muted-foreground)]",
                )}
              >
                {t(LABEL_KEY[step])}
              </span>

              {/* The desktop connector: a sibling in the row, with a width of
                  its own. */}
              {!last && (
                <span
                  aria-hidden="true"
                  className={cn("hidden h-0.5 w-8 rounded-full md:block lg:w-10", lineClass)}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
