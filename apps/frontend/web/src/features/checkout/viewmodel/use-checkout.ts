import { useMutation } from "@tanstack/react-query";
import { GraphqlError } from "@/shared/lib/graphql/session-graphql";
import {
  createBooking,
  type CreateBookingInput,
  type CreatedBooking,
} from "@/features/checkout/data/checkout.repository";

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
