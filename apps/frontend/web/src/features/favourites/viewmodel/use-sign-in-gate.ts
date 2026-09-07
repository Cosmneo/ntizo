import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useSession } from "@/shared/hooks/use-session";

/**
 * "Is there a session, and if not, where do I send them?" — shared by all
 * three writing hooks.
 *
 * **Signed out, a favourites write navigates rather than fires.** Every one of
 * the nine fields refuses an anonymous caller (`requireUser` throws before
 * anything else runs), so an anonymous mutation is a round trip whose only
 * possible outcome is a refusal the reader then has to be told about. Sending
 * them to sign in with the way back is the same thing they wanted, one step
 * earlier. Same gesture the directory's message button makes, arrived at from
 * the opposite direction: that one fires, reads `UNAUTHENTICATED` off the
 * error, and redirects — which is right for a button that already needs a
 * server round trip to work, and wrong for a heart that has to answer
 * instantly.
 *
 * `next` carries the page the reader was on, so signing in puts them back on
 * the listing they were saving from rather than on a home page.
 *
 * `useRouterState` with a selector rather than the whole state, so a card
 * re-renders on an actual pathname change and not on every router tick —
 * this hook is called once per card on a page of twenty-four. The pathname is
 * read at the moment the reader taps, which is why it is read here in render
 * and not captured in an effect: `provider-rail.tsx` records what happens when
 * a redirect effect lists `pathname` as a dependency and re-fires itself with
 * `next: "/sign-in"`.
 */
export function useSignInGate(): { signedIn: boolean; goToSignIn: () => void } {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return {
    signedIn: Boolean(session),
    goToSignIn: () => void navigate({ to: "/sign-in", search: { next: pathname } }),
  };
}
