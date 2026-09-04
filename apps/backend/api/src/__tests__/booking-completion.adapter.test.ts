import { describe, expect, it } from "bun:test";
import type {
  Booking,
  BookingBootstrap,
  CompleteBookingInput,
} from "@ntizo/backend/modules/ntizo/bounded-contexts/booking";
import { bookingCompletionOver } from "../booking-completion.adapter";

/**
 * Why this test exists.
 *
 * `bookingCompletionOver` is the only place on the platform that decides two
 * things about a booking closed by its review: what `booking_change.reason`
 * records, and which human is recorded as having closed it. Both are
 * type-correct in every wrong version of themselves — `CompleteReason` has
 * three members and `changedByUserId` accepts `null` by design — so `tsc`
 * cannot tell `completed_by_review` from `completed_by_admin`, and no test on
 * either side reaches this file: `SubmitReviewCommand`'s own tests exercise a
 * fake port, and the backend suite cannot see `apps/`.
 *
 * The third thing it decides is subtler and worse to get wrong. The review
 * context's failure semantics rest on this call being *awaited*: dropping the
 * `await` would resolve the port before the command settles, so
 * `SubmitReviewCommand`'s `try/catch` could never see the
 * `BookingTransitionError` the sweep's window arm produces — the deliberate
 * swallow would become an unhandled rejection in the Worker and the
 * `console.error` naming the booking would never be written. Every
 * command-level test would stay green, because none of them runs this
 * function. Hence the third case below.
 */

/**
 * Records what the adapter hands `CompleteBookingCommand`.
 *
 * `execute` is typed against the real `CompleteBookingInput`, so the part
 * that matters — the shape and the values the adapter supplies — is still
 * compiler-checked. Only the class identity is cast away at the call site:
 * `CompleteBookingCommand` has private fields, which defeat structural
 * assignability, and the same `as unknown as` shape is what
 * `wait-until.test.ts` already uses for its `ExecutionContext` double.
 */
class RecordingCompleteBooking {
  public calls: CompleteBookingInput[] = [];
  public answer: Booking | null = null;
  public failWith: Error | null = null;

  async execute(input: CompleteBookingInput): Promise<Booking | null> {
    this.calls.push(input);
    if (this.failWith) throw this.failWith;
    return this.answer;
  }
}

function adapterOver(command: RecordingCompleteBooking) {
  return bookingCompletionOver(
    command as unknown as BookingBootstrap["useCases"]["completeBooking"],
  );
}

describe("bookingCompletionOver", () => {
  it("names the review door and the reviewer who opened it", async () => {
    const command = new RecordingCompleteBooking();

    await adapterOver(command).execute({ bookingId: "bk-1", requesterUserId: "cus-1" });

    // The whole object, not just the booking id. `reason` is what the audit
    // trail will say forever — `completed_by_admin` here would claim support
    // closed every reviewed booking, and `changedByUserId: null` would claim
    // nobody did. `changedByUserId` is the reviewer, who the eligibility
    // query guarantees is this booking's own customer.
    expect(command.calls).toEqual([
      { bookingId: "bk-1", reason: "completed_by_review", changedByUserId: "cus-1" },
    ]);
  });

  it("drops the booking the command answers with", async () => {
    // `CompleteBookingCommand` replies with the booking it moved; the review
    // context has nothing to do with it, which is why `CompleteBookingPort`
    // is `Promise<void>`. Asserted so a future edit cannot quietly start
    // leaking a booking aggregate across the context boundary.
    const command = new RecordingCompleteBooking();
    command.answer = { id: "bk-1" } as unknown as Booking;

    await expect(
      adapterOver(command).execute({ bookingId: "bk-1", requesterUserId: "cus-1" }),
    ).resolves.toBeUndefined();
  });

  it("resolves to nothing when the command moved nothing — a lost race is not a failure here", async () => {
    // The other half of the same story: `null` is what the command returns
    // when somebody else's write got there first, most likely the sweep's own
    // window arm a second earlier. It reaches this side as the same
    // non-event as a success, which is what lets `SubmitReviewCommand` treat
    // a lost compare-and-swap and a thrown refusal identically.
    const command = new RecordingCompleteBooking();
    command.answer = null;

    await expect(
      adapterOver(command).execute({ bookingId: "bk-1", requesterUserId: "cus-1" }),
    ).resolves.toBeUndefined();
  });

  it("awaits the command, so a refusal reaches the caller that swallows it", async () => {
    // A plain `Error` rather than the real `BookingTransitionError`: what is
    // pinned here is that the rejection arrives at all, not which one it is.
    // Turning the `await` into `void` makes this resolve instead — and would
    // dismantle the review context's swallow, since a `try/catch` cannot
    // catch a promise nobody handed it.
    const command = new RecordingCompleteBooking();
    command.failWith = new Error("A booking cannot go from COMPLETED to COMPLETED");

    await expect(
      adapterOver(command).execute({ bookingId: "bk-1", requesterUserId: "cus-1" }),
    ).rejects.toThrow("A booking cannot go from COMPLETED to COMPLETED");

    expect(command.calls).toHaveLength(1);
  });
});
