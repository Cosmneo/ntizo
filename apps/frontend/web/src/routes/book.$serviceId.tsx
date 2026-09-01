import { createFileRoute } from "@tanstack/react-router";
import { ChooseWhenPage } from "@/features/checkout/ui/choose-when-page";
import { prefetchServiceDetail } from "@/features/directory/services/viewmodel/use-service-detail";

/**
 * Step 1 of checkout, at `/book/<serviceId>`: when.
 *
 * The id in this position is a *service*, and it is the only page of the
 * three where that is true — steps 2 and 3 are `/booking/<bookingId>/…`,
 * because by then a draft exists and it is the only thing they are about.
 * Nothing here is addressed by a booking id, because there is no booking yet:
 * creating one is what this page's confirm does.
 *
 * `ssr: false`, unlike the service page this is reached from. That page is
 * built to be crawled; this one is a purchase in progress, it is useless to a
 * crawler, and its only anonymous outcome is a trip to sign in. Rendering it
 * on the server would buy nothing and would put a checkout URL in front of
 * the prerenderer.
 */
export const Route = createFileRoute("/book/$serviceId")({
  ssr: false,
  /**
   * The chosen slot lives in the URL, not in the page's state — see
   * `ChooseWhenPage`'s own doc comment for why that is load-bearing rather
   * than tidy.
   *
   * **Every key is returned, and a rejected one is returned as `undefined`
   * rather than omitted.** `services.index.tsx` omits its rejected filters,
   * and that idiom does not narrow anything here: a match's search is
   * `{ ...parentSearch, ...validated }`, and the root has no `validateSearch`
   * at all, so the *raw* URL value survives under any key this function does
   * not name. `?expired=banana` reached the page as the string "banana" and
   * rendered the lapsed-hold message, because the page asks whether the flag
   * is truthy and "banana" is. Naming the key with `undefined` is what
   * actually overrides the raw value — and it costs nothing in the address
   * bar, since the router's own `encode` skips `undefined` (`qss.js`:
   * `if (val !== void 0)`).
   *
   * `optionId` is which package the customer is buying, and it is here for
   * the same reason the slot is: it is a *choice*, made on the service page,
   * and this route is the only thing standing between that choice and the
   * price the booking will actually charge. Without it this page fell back to
   * the service's default option, so somebody who picked the 900 package and
   * pressed "see availability" got a draft for the 500 one — silently, and in
   * either direction. It stays *optional*, because a caller that genuinely
   * has no option in hand (a provider's service row is handed a `ServiceDTO`,
   * whose `defaultOption` carries no id) must still be able to link here.
   *
   * `expired` is a flag the checkout countdown sets when a draft's hold
   * lapses on step 2 or 3 and it sends the customer back here. Only `true`
   * is honoured: it exists to make the page say what happened, and any other
   * value means somebody typed something.
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): { memberId?: string; startsAt?: string; optionId?: string; expired?: true } => {
    const text = (key: string): string | undefined => {
      const raw = search[key];
      return typeof raw === "string" && raw !== "" ? raw : undefined;
    };
    // `true` when the countdown navigated here in this session, `"true"` when
    // the same URL was reloaded or shared — the browser hands a boolean back
    // as text. Anything else is somebody typing.
    const expired = search["expired"] === true || search["expired"] === "true";
    return {
      memberId: text("memberId"),
      startsAt: text("startsAt"),
      optionId: text("optionId"),
      expired: expired ? (true as const) : undefined,
    };
  },
  // The service, not the availability: `useServiceDetail` is a suspense query
  // and the page reads it before anything else (the option it will book, the
  // price it shows). Primed here so the route arrives in one piece rather
  // than suspending mid-render. The calendar itself is a plain `useQuery`
  // with its own loading state, and its window depends on state this loader
  // cannot know.
  loader: ({ context, params }) => prefetchServiceDetail(context.queryClient, params.serviceId),
  component: ChooseWhen,
});

function ChooseWhen() {
  const { serviceId } = Route.useParams();
  // Keyed by the service, so every piece of the page's own local state (the
  // week it opened on, the day, the chosen length) starts over when the id
  // does. The router reuses one match across a param change, so React would
  // otherwise reconcile the same component instance and carry one service's
  // calendar onto another's — the same fact `AvailabilitySheet` relied on a
  // per-service `key` for, and the reason it needed no reset effect.
  return <ChooseWhenPage key={serviceId} serviceId={serviceId} />;
}
