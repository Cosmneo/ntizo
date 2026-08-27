import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { BadgeCheck, MapPin, MessageSquare } from "lucide-react";
import { Button } from "@ntizo/frontend-ui";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { RatingStars } from "@/features/directory/ui/rating-stars";
import { useStartThread } from "@/features/messaging/viewmodel/use-start-thread";

/**
 * Who this business is, in the space above the fold.
 *
 * Everything here is something the platform actually knows. The reference
 * design this follows also promised "312 jobs completed", the languages the
 * provider speaks, and a map of the area they cover — none of which exists:
 * there are no bookings to count, nothing records what anyone speaks (the
 * services browse's own language filter says so, because it filters the
 * language a *listing* is written in), and the precise location is deliberately
 * kept out of the public read model, so a coverage radius would be a circle
 * drawn around a guess. Inventing any of the three would be the page telling a
 * customer something nobody checked.
 */
export function ProviderHero({ provider }: { provider: ProviderPublicDTO }) {
  const { t } = useTranslation("directory");

  const where = [provider.district, provider.city, provider.country].filter(Boolean).join(", ");
  const kind = provider.type === "organization" ? t("typeOrganization") : t("typeIndividual");

  return (
    <header className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
      <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-muted)]">
        {provider.logoUrl ? (
          <img src={provider.logoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="font-rounded text-xl font-semibold text-[var(--color-muted-foreground)]"
          >
            {initials(provider.name)}
          </span>
        )}
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="type-h1 flex flex-wrap items-center gap-2">
            {provider.name}
            {provider.verified && (
              <span className="type-caption inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] px-2 py-0.5 font-semibold text-[var(--color-primary)]">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t("providerVerified")}
              </span>
            )}
          </h1>

          {/* The way into the Communication context from anywhere in the
              directory — without this, `/messages` exists and nobody can
              reach it. See `MessageProviderButton`'s own doc comment. */}
          <MessageProviderButton providerId={provider.id} />
        </div>

        <p className="type-body mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--color-muted-foreground)]">
          <span>{kind}</span>
          {provider.categories.length > 0 && (
            <span>· {provider.categories.map((c) => c.name).join(" · ")}</span>
          )}
          {where && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {where}
            </span>
          )}
        </p>

        <p className="mt-2">
          <RatingStars average={provider.ratingAverage} count={provider.reviewCount} />
        </p>

        {provider.description && (
          <p className="type-body mt-4 max-w-[65ch] whitespace-pre-line">{provider.description}</p>
        )}
      </div>
    </header>
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
 */
function MessageProviderButton({ providerId }: { providerId: string }) {
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
    <div className="shrink-0">
      <Button type="button" onClick={handleClick} disabled={starting} className="gap-2">
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        {starting ? t("messageProviderStarting") : t("messageProviderCta")}
      </Button>

      {errorCode && errorCode !== "UNAUTHENTICATED" && (
        <p role="alert" className="type-caption mt-1.5 max-w-[22ch] text-[var(--color-destructive)]">
          {t(`messageProviderError.${knownError}`)}
        </p>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? "")
    .join("")
    .toUpperCase();
}
