import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { Button, buttonVariants } from "@ntizo/frontend-ui";
import type { ProviderPublicDetailDTO } from "@ntizo/shared/read-models";
import { formatAmount } from "@/features/directory/services/domain/service-card";
import { RailCard } from "@/features/directory/ui/rail-card";
import { TrustList } from "@/features/directory/ui/trust-list";
import { WeeklyHoursCard } from "@/features/directory/ui/weekly-hours-card";
import { useStartThread } from "@/features/messaging/viewmodel/use-start-thread";

/**
 * What this business costs and how to reach it — the column that stays in
 * view while the page beside it scrolls.
 *
 * The price leads because it is the one thing the provider page never said
 * before: a reader arriving from a search result could read a name, a
 * description and a list of services and still not learn whether this was a
 * 500 or a 5000 job until they opened one. `fromAmountMinor` is the cheapest
 * active option of a published service — the same number the service rows
 * below print — so the rail and the list cannot disagree about the lowest
 * price.
 *
 * **The price block renders only when there is a price.** A provider who
 * publishes nothing priced has no "from", and `0` is not a stand-in for
 * "unknown": it is a number somebody could actually charge, and printing it
 * would advertise this business as free. The buttons and the trust list stay
 * either way, so what is left still reads as a finished card rather than as
 * one that failed to load — which is the state most providers are in.
 *
 * **The rail claims exactly two things**, and only one of them
 * unconditionally. See `TrustList`'s own doc comment for why nothing joins
 * that list without a fact behind it: the reference design also promised a
 * response time, a free-cancellation window and payment held until the job
 * was done, none of which this platform measures, implements or does.
 *
 * "See services" is an anchor down to `#servicos`, not a second copy of the
 * list, and deliberately not a booking control. The Booking context does not
 * exist yet, so nothing on this page may imply a reservation was made.
 */
export function ProviderRail({ provider }: { provider: ProviderPublicDetailDTO }) {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const { fromAmountMinor, fromCurrency } = provider;
  const price =
    fromAmountMinor !== null && fromCurrency !== null
      ? formatAmount(fromAmountMinor, fromCurrency, locale)
      : null;

  // `verified` means an administrator accepted at least one document, so the
  // sentence is conditional on it here rather than baked into `TrustList`. A
  // badge that is always lit says nothing; a sentence that is always printed
  // lies.
  const trustItems = [provider.verified ? t("trustVerified") : null, t("trustMessagesKept")].filter(
    (item): item is string => item !== null,
  );

  return (
    <div className="grid gap-4">
      <RailCard>
        {price !== null && (
          <>
            <p className="flex flex-wrap items-baseline gap-2">
              {/* Neither `type-display` nor `type-h1`: this is a number in a
                  22rem column, and the display scale's `clamp(30px, 3.6vw,
                  42px)` grows with the viewport rather than with the card it
                  sits in. Assembled from the same tokens those classes use,
                  the way `ProviderReviews`'s own 52px score already is. */}
              <b className="font-display text-[30px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
                {price}
              </b>
              <span className="type-body text-[var(--color-muted-foreground)]">
                {t("railFromPrice")}
              </span>
            </p>
            {/* No count in this sentence, deliberately. `fromAmountMinor` is
                the minimum over *priced options*; `serviceCount` counts
                *published services*, and the two are not the same set — a
                provider with one priced service and two quote-only ones would
                have read "the cheapest of 3" beside a minimum taken over one.
                The read model exposes no priced-service count, so the honest
                fix is to stop claiming a denominator rather than to print one
                the number was not drawn from. */}
            <p className="type-body mt-2 text-[var(--color-muted-foreground)]">
              {t("railCheapestOf")}
            </p>
          </>
        )}

        <div className={price === null ? "grid gap-2.5" : "mt-5 grid gap-2.5"}>
          <MessageProviderButton providerId={provider.id} />
          <a
            href="#servicos"
            className={buttonVariants({ variant: "outline", className: "w-full" })}
          >
            {t("railViewServices")}
          </a>
        </div>

        <TrustList items={trustItems} />
      </RailCard>

      {/* Renders nothing at all for a provider who never configured
          availability — see its own doc comment for why seven rows of
          "Closed" would be a claim rather than a fact. */}
      <WeeklyHoursCard hours={provider.weeklyHours} />
    </div>
  );
}

/**
 * The way into a conversation with this provider — the button this whole
 * page exists to reach. Without it the inbox at `/messages` and its
 * `communicationStartThread` mutation are both fully built and reachable by
 * nobody, the same shape of failure as a handler that is written, tested and
 * never mounted.
 *
 * `start` is called unconditionally on click, never after a "does a thread
 * already exist" check first: `useStartThread` documents `StartThreadCommand`
 * as an upsert against `thread_customer_provider_uq`, so calling it twice for
 * the same (customer, provider) pair resolves to the same thread rather than
 * opening a second one. Whatever id comes back is where this navigates.
 *
 * A visitor who is not signed in gets `"UNAUTHENTICATED"` back from the
 * mutation (`requireUser`'s `ForbiddenError`, surfaced by `messagingErrorCode`
 * — see that function's doc comment for why the coarse wire code alone
 * cannot tell this apart from a genuine refusal). This page is public, unlike
 * `/messages` itself which `_customer/route.tsx` already gates, so that is
 * an expected outcome here, not a bug: the effect below sends them to sign in
 * with `next` pointing back at this page, the same pattern `_customer/route.tsx`
 * and `onboarding.tsx` already use for the same redirect.
 *
 * Moved here from `provider-hero.tsx` with its effect untouched, because the
 * price is in this rail and the way to act on it belongs beside the price
 * rather than beside the title. The only thing that changed in the move is
 * width: the rail's controls are a stack of full-width blocks, where the
 * hero's button sat inline beside an `h1`.
 *
 * Exported, because a service's rail (`RailPriceSummary`) needs the identical
 * control and the redirect effect below is the part that must not be written
 * twice — a second copy is a second place for the "don't list `pathname`"
 * trap to be re-introduced by someone tidying up a dependency array. The two
 * rails differ only in emphasis, which is what `variant` carries: on a
 * provider's page this is the primary action, on a service's page the primary
 * is the calendar and this sits under it.
 */
export function MessageProviderButton({
  providerId,
  variant = "default",
}: {
  providerId: string;
  /** `outline` where another control is already the page's primary action. */
  variant?: "default" | "outline";
}) {
  const { t } = useTranslation("directory");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { start, starting, errorCode } = useStartThread();

  useEffect(() => {
    if (errorCode === "UNAUTHENTICATED") {
      void navigate({ to: "/sign-in", search: { next: pathname } });
    }
    // `pathname` deliberately left out of the dependency array: this must
    // fire once, when `errorCode` first becomes "UNAUTHENTICATED", reading
    // whatever `pathname` is at that moment. Listing it turns the
    // navigation this effect just performed into its own retrigger — the
    // redirect lands on `/sign-in`, `pathname` updates to `/sign-in`, and
    // the effect re-runs and redirects again with `next: "/sign-in"`.
    // Verified locally: with `pathname` included, this test's assertion on
    // `next` read back the sign-in path instead of the provider page it
    // started from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorCode, navigate]);

  const handleClick = () => {
    void start(providerId).then(
      (threadId) => void navigate({ to: "/messages", search: { thread: threadId } }),
      // Swallowed on purpose: `errorCode` above already reflects the
      // failure reactively (`useStartThread` reads it off `mutation.error`),
      // and the `<p role="alert">` below renders from that same state. An
      // unhandled rejection here would just be this handler repeating what
      // the hook already tracked.
      () => {},
    );
  };

  const knownError = errorCode === "PROVIDER_NOT_CONTACTABLE" ? errorCode : "GENERIC";

  return (
    <div>
      <Button
        type="button"
        variant={variant}
        onClick={handleClick}
        disabled={starting}
        className="w-full gap-2"
      >
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        {starting ? t("messageProviderStarting") : t("messageProviderCta")}
      </Button>

      {/* No `max-w-[22ch]` any more: the hero wrapped this under a wide title
          and needed the measure held down; the rail is already 22rem, so the
          cap would only make a short sentence wrap twice. */}
      {errorCode && errorCode !== "UNAUTHENTICATED" && (
        <p role="alert" className="type-caption mt-1.5 text-[var(--color-destructive)]">
          {t(`messageProviderError.${knownError}`)}
        </p>
      )}
    </div>
  );
}
