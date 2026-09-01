import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import { useUpdateMyProfile } from "@/features/account/viewmodel/use-update-profile";
import {
  bookingQueries,
  createBooking,
  submitBooking,
  type CheckoutBooking,
  type CreateBookingInput,
  type CreatedBooking,
  type SubmitBookingAddress,
  type SubmitBookingInput,
  type SubmittedBooking,
} from "@/features/checkout/data/checkout.repository";

/**
 * Re-exported so a checkout screen can name what it renders.
 *
 * `ui` may not import from `data` — `boundaries/dependencies` forbids the
 * edge, and rightly: a page that knows where a booking is stored is a page
 * that can fetch one itself. The viewmodel is the one layer allowed to see
 * both, so the type comes through here rather than the rule being loosened.
 */
export type { CheckoutBooking, SubmitBookingAddress };

/**
 * The domain code a checkout screen branches on — never `.message`, and
 * never the coarse kit code on its own.
 *
 * The refusals this page has to tell apart all arrive with the coarse code in
 * `extensions.code` and the specific one in `extensions.originalCode`:
 * `UNAUTHENTICATED` rides inside a `FORBIDDEN`, `SLOT_ALREADY_TAKEN` inside a
 * `CONFLICT`, `SLOT_NOT_OFFERED` and `SLOT_IN_PAST` inside an
 * `UNPROCESSABLE`. `GraphqlError.code` already prefers `originalCode`, so it
 * reads through to the specific one — which is the point: "sign in" and "that
 * time just went" need two entirely different screens, and the coarse code
 * cannot tell them apart. See `messagingErrorCode`'s doc comment for the same
 * argument made in full against the kit's compiled source.
 *
 * `undefined` when there is no error, or the failure is not a `GraphqlError`
 * at all (a dropped connection, a thrown non-Error) — nothing to branch on
 * beyond "something went wrong".
 */
function checkoutErrorCode(error: unknown): string | undefined {
  return error instanceof GraphqlError ? error.code : undefined;
}

/**
 * Holding a slot: step 1's one and only write.
 *
 * `mutateAsync` rather than `mutate`, because the caller genuinely needs the
 * answer — the `bookingId` is the next two pages' whole address. The failure
 * is reported twice on purpose: the returned promise rejects (so a caller can
 * choose not to navigate) and `errorCode` holds the code reactively (so the
 * page can render a sentence about it). A caller that only wants the second
 * should still attach a rejection handler; an unhandled rejection is noise,
 * not information.
 *
 * `reset` exists for the same reason the error is sticky: once a slot has
 * been refused, the message must clear the moment the customer picks a
 * different time, or they read "that time is taken" about a time nobody has
 * tried yet. It also re-arms the effects that watch `errorCode`, which would
 * otherwise not fire again on a second, identical refusal.
 */
export function useCreateBooking() {
  const mutation = useMutation({ mutationFn: createBooking });

  return {
    create: (input: CreateBookingInput): Promise<CreatedBooking> => mutation.mutateAsync(input),
    pending: mutation.isPending,
    errorCode: checkoutErrorCode(mutation.error),
    failed: mutation.isError,
    reset: mutation.reset,
  };
}

/**
 * The draft steps 2 and 3 are about.
 *
 * A plain query rather than a suspense one, because `null` is an *answer*
 * here and not an absence to render past: it is how the server says the id
 * names nothing this customer holds, and the page turns it into a trip back
 * to step 1. Suspending would make that answer arrive as a rendered page
 * rather than as data the page can branch on.
 *
 * `loading` is `isPending` and nothing else. It has to be checked before
 * `booking === null` is believed, or the first frame — data not yet
 * fetched — reads as "your draft is gone" and bounces every customer off the
 * page before their booking has finished loading.
 */
export function useMyBooking(bookingId: string) {
  const query = useQuery(bookingQueries.byId(bookingId));

  return {
    /** The booking, `null` when it is not the caller's to read, `undefined` while loading or failed. */
    booking: query.data,
    loading: query.isPending,
    failed: query.isError,
  };
}

/** Everything step 3 sends, across both of its writes. */
export interface SendBookingRequestInput extends SubmitBookingInput {
  /**
   * The handset M-Pesa will push its payment prompt to, already normalised —
   * the page validates with `toMpesaMsisdn` before it gets here, so this is
   * never a number the charge would later refuse.
   */
  phoneNumber: string;
}

/**
 * Sending the request: step 3's writes, and the last two of this checkout.
 *
 * **Two mutations, in this order, and not one.** `user.updateMyProfile` with
 * the phone number, then `booking.submit`. Setting a phone number is the User
 * context's job — a booking command reaching across to write a profile would
 * need a writer port that exists for no other reason — and `submit` refuses a
 * customer who has none on file, so the profile write is not a convenience
 * beside the submit but a precondition of it.
 *
 * The order is what makes a half-failure recoverable rather than wrong. If
 * the submit fails the phone is still saved: the customer presses again and
 * the second attempt has everything it needs. Reversed, a submit that
 * succeeded against a stale number would have sent a request that cannot be
 * paid for, which is precisely the failure `CustomerPhoneMissingError` exists
 * to prevent.
 *
 * Awaited rather than fired together, for the same reason: `Promise.all` here
 * would let the submit reach the server before the profile write committed,
 * and refuse for a number the customer had just supplied.
 *
 * `useUpdateMyProfile` rather than the repository function directly, because
 * the cache invalidation belongs with the write: the header, the account menu
 * and the account page all read `user.me`, and a phone number set here has to
 * reach them.
 */
export function useSendBookingRequest() {
  const profile = useUpdateMyProfile();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: SendBookingRequestInput): Promise<SubmittedBooking> => {
      await profile.mutateAsync({ phoneNumber: input.phoneNumber });
      return submitBooking({
        bookingId: input.bookingId,
        address: input.address,
        description: input.description ?? null,
      });
    },
    onSuccess: (_result, input) => {
      // The booking has left `DRAFT`, and the cached copy still says it has
      // not. Step 2 is one back-button press away and reads the same key —
      // without this it would render its form, and its continue button, for
      // a request that has already gone. Invalidated here rather than at the
      // call site for the reason `useUpdateMyProfile` invalidates `user.me`
      // there: the staleness is a consequence of the write, so it belongs
      // with the write.
      void qc.invalidateQueries({ queryKey: bookingQueries.byId(input.bookingId).queryKey });
    },
  });

  return {
    /**
     * Rejects as well as reporting through `errorCode`, so a caller can
     * decline to navigate — the same contract `useCreateBooking` offers, and
     * for the same reason: the page has to know whether the request actually
     * went before it sends the customer to their bookings.
     */
    send: (input: SendBookingRequestInput): Promise<SubmittedBooking> =>
      mutation.mutateAsync(input),
    pending: mutation.isPending,
    errorCode: checkoutErrorCode(mutation.error),
    failed: mutation.isError,
  };
}
