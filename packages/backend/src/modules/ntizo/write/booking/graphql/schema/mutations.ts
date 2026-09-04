import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { BOOKING_DECLINE_REASONS } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Turns a checkout into a held slot and a debt the customer has not paid
 * yet — `CreateBookingCommand`'s own doc comment has the full story.
 *
 * **There is no `customerId` and no `durationMinutes` field, and both
 * absences are the point.** The customer comes from `requireUser(ctx)` in
 * the handler, never from this input — an input field here would make this
 * the mutation that books a slot on someone else's behalf. The duration
 * comes from the service option the command reads (`pricing.durationMinutes`),
 * not from the client, which is the whole reason a customer cannot book a
 * two-minute house clean by editing a payload: there is no field to edit.
 *
 * **`providerMemberId` is the third field of that class, and it could not be
 * omitted the same way.** Unlike `customerId` and `durationMinutes`, there is
 * no server-side source for "which member's calendar" — the customer is
 * genuinely choosing one, off the same availability modal that calls
 * `ListServiceAvailability`. So this field stays, and the bug an omission
 * would have prevented is closed by a check instead:
 * `SlotValidityReaderPort`, called from `CreateBookingCommand` before
 * anything is written, refuses a member who does not perform this service —
 * including a member borrowed from a *different* provider's option, which
 * used to reach `Booking.create` with nothing but a foreign key standing in
 * its way and would silently hold that other provider's calendar against a
 * real customer. The same call also refuses a provider that is not `active`
 * and a `startsAt` that is not a real, future, on-grid start for that
 * member.
 *
 * **There is no `address` and no `description` field either, and that is the
 * whole reason this flow works.** This mutation is checkout's step 1: the
 * customer has picked a time and nothing else, and the draft has to be able
 * to exist before the address does or the slot could not be held while they
 * fill the rest in. Both fields moved to `submitBooking` below, where the
 * customer actually supplies them. They are *removed* rather than made
 * optional: an optional field nothing ever sets is a field somebody
 * eventually sets wrongly, and a draft carrying half an address is one
 * `Booking.submit` would then have to reconcile against the address it was
 * handed.
 *
 * The bounds here mirror the aggregate's rather than replacing them — this
 * is the edge refusing obvious nonsense cheaply (a `startsAt` that isn't a
 * real date), with `Booking.create` as the place the rule is *defined*. See
 * `write/review`'s schema comment for the same argument made about a rating
 * of 4.5.
 *
 * `startsAt` crosses the wire as an ISO string (`z.string().datetime()`) —
 * GraphQL has no native `Date` scalar this kit uses — and the handler
 * converts it to a `Date` before calling the command. The conversion lives
 * in the handler, not here and not in the command: `CreateBookingInput`'s own
 * type says `Date` and should keep saying it.
 */
export const createBooking = defineMutation({
  input: zodSchema(
    z.object({
      serviceOptionId: z.string().min(1),
      providerMemberId: z.string().min(1),
      startsAt: z.string().datetime(),
      // The locale the customer was reading the page in — the same locale
      // `ServicePricingReaderPort.findOption` uses to snapshot the service
      // and option names onto the booking.
      locale: z.string().min(2),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1), expiresAt: z.string() })),
  docs: { summary: "Book a service option", tags: ["Booking"] },
});

/**
 * The customer finishes checkout and sends the request on to the provider.
 *
 * **There is no `customerId` field**, for the same reason `createBooking`
 * has none: the customer comes from `requireUser(ctx)`, and a field here
 * would make this the mutation that submits somebody else's draft. The
 * command's own authorisation check refuses a requester who is not the
 * booking's customer.
 *
 * The address arrives here rather than on `createBooking` because the
 * customer supplies it on step 2, after the slot is already held — see the
 * design's own account of the conflict this resolves. `description` travels
 * with it because it is the same page's other field: step 2 is the address
 * *and* the optional note about what needs doing.
 *
 * The bounds are the edge's cheap refusal, not the rule: `Booking.submit`
 * is where a blank or missing address component is actually refused, and
 * `SubmitBookingCommand` deliberately keeps no second copy of that check.
 * What this schema does add is the guarantee that `label`, `line` and `city`
 * are present, non-blank strings by the time any of them reaches the
 * aggregate — the kit validates every input against this schema before the
 * handler runs (`validateInput` defaults to `true`), so an `undefined`
 * component cannot arrive from the wire.
 *
 * **`.optional()` sits beside `.nullable()` on every field that is genuinely
 * optional, and the pair is not redundant.** Zod's `.nullable()` accepts
 * `null` and rejects `undefined`; GraphQL lets a document simply omit a
 * nullable input field, and an omitted key arrives as `undefined`. Without
 * `.optional()` the omission is a validation failure rather than the null it
 * plainly means — so a client would have to be told "send explicit nulls",
 * which is exactly the kind of instruction that holds until it doesn't.
 * Three clients are about to be written against this surface.
 */
export const submitBooking = defineMutation({
  input: zodSchema(
    z.object({
      bookingId: z.string().min(1),
      address: z.object({
        label: z.string().trim().min(1),
        line: z.string().trim().min(1),
        city: z.string().trim().min(1),
        district: z.string().trim().min(1).nullable().optional(),
        directions: z.string().trim().max(500).nullable().optional(),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
      }),
      description: z.string().trim().max(1000).nullable().optional(),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1), respondBy: z.string() })),
  docs: { summary: "Send a booking request to the provider", tags: ["Booking"] },
});

/**
 * The provider's yes. Takes only the booking: which workspace it belongs to
 * is on the booking, and whether the caller is in that workspace is the
 * command's check (`ProviderMemberReaderPort.isMember`), not the client's
 * claim. Returns the id and nothing else — the page refetches the booking,
 * which by then carries the payment window on `expiresAt`.
 */
export const acceptBooking = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Accept a booking request", tags: ["Booking"] },
});

/** The provider's no, with one of four reasons or none. Tokens, never prose: the customer's inbox translates them. */
export const declineBooking = defineMutation({
  input: zodSchema(
    z.object({
      bookingId: z.string().min(1),
      reason: z.enum(BOOKING_DECLINE_REASONS).optional(),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Decline a booking request", tags: ["Booking"] },
});

/**
 * The provider says the work is done, and the customer's three-day window
 * opens.
 *
 * **There is no `reason` field, and its absence is the security of the whole
 * closing surface.** `MarkBookingDoneCommand` takes an optional
 * `MarkDoneReason` and *skips its membership check* for two of the three
 * tokens — `marked_done_by_admin` and `marked_done_by_platform` are reachable
 * only from inside the process, which is exactly what makes the exemption
 * safe. A field here would hand any signed-in stranger the token that turns
 * the check off, and with it the ability to close any provider's booking on
 * the platform. The handler passes `marked_done_by_provider` as a literal it
 * writes itself, never something it read off the wire; `booking.adminMarkDone`
 * below is the other door, and it hardcodes its own token the same way.
 *
 * There is no `requesterUserId` field either, for the reason `booking.accept`
 * has none: the member comes from `requireUser(ctx)`. That absence matters
 * more here than anywhere else on this schema, because `requesterUserId: null`
 * is not a value that fails closed in the command — it is the *sweep's* value,
 * and it skips the membership check and records the platform as the actor.
 */
export const markBookingDone = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Say the work is done", tags: ["Booking"] },
});

/**
 * "Still going." The provider pushes the platform's question out another
 * seven days rather than being closed for them on a claim nobody made.
 *
 * `KeepBookingOpenCommand` has no exempt arm at all — its `requesterUserId`
 * is not nullable and membership is always checked — so this field is the
 * least dangerous of the six. It still takes only the booking id, because a
 * caller who could name the member would be answering the platform's question
 * on somebody else's behalf.
 *
 * **It refuses `BOOKING_NOT_ENDED`, the same as `booking.markDone`**, and a
 * caller has to be ready for it even though the provider's page never draws
 * the button before the appointment ends. "Still going" is a claim about a
 * job that has outrun its slot, so it cannot be made before the slot runs
 * out — and this is the one field on the closing surface where accepting it
 * early would not merely record something untrue: it moves the sweep's clock
 * in front of `endsAt` and leaves the sweep refusing that booking every
 * minute until the appointment finally passes. See `Booking.keepOpen`.
 */
export const keepBookingOpen = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Say the work is still going", tags: ["Booking"] },
});

/**
 * The contract the customer's zone implements against. Built and tested here;
 * no screen calls it yet.
 *
 * The customer says something is wrong inside the three days they were given:
 * a support thread opens with their account of it and the booking's clocks
 * stop until an administrator decides. `DisputeBookingCommand` refuses anybody
 * but the booking's own customer, so there is no `requesterUserId` field here
 * for the same reason `booking.submit` has no `customerId`.
 *
 * **`SUPPORT_TOO_MANY_OPEN` is a refusal this field can give, and the screen
 * that calls it has to have an answer for it.** A dispute *is* a support
 * request — `DisputeBookingCommand` opens the thread through
 * `OpenSupportRequestCommand` before its own write — so it inherits that
 * command's cap of ten open requests per person
 * (`MAX_OPEN_SUPPORT_REQUESTS`, `support-request.aggregate.ts`). A customer
 * already at the cap is refused here, and nothing about their booking pauses
 * while they are: the three-day window keeps running and the sweep completes
 * the booking when it ends. That is a forfeiture on a hard deadline, so it
 * must not be reported through whatever generic "try again" branch the form
 * uses — the customer has to be told which of their open threads to close,
 * and the code is the only thing that distinguishes it.
 *
 * Whether disputes should be exempt from that cap at all is a policy question
 * this branch deliberately did not answer; `dispute-thread.adapter.ts` is
 * where an allowance would go, and follow-up #181 carries the decision.
 *
 * **The attachment shape is the upload route's answer, unchanged.**
 * `POST /api/communication/attachments` stores the bytes and replies with
 * exactly `{ storageKey, fileName, contentType, sizeBytes }`; the client holds
 * that object and sends it back here verbatim, the same round trip
 * `communication.sendMessage` already uses. Only `storageKey` is trusted on
 * the far side — the communication context reads the file's real name, type
 * and size back from storage rather than believing any of the other three (see
 * `resolveAttachments`) — so this schema is a shape check, not a source of
 * truth. Five is the cap the design gives a dispute.
 *
 * **`communication.sendMessage` takes `storageKey` alone, and this field does
 * not — the difference is deliberate and it is safe here for a reason worth
 * stating.** That mutation was narrowed by a whole-branch review, because the
 * name it accepted was *written to the attachment row*: a client could upload
 * a file whose name passed the upload route's `hasContact` check and then send
 * back a different, unchecked one. Nothing of the sort can happen through this
 * field. `disputeThreadOver` — the composition root's adapter, and the only
 * implementation of `OpenDisputeThreadPort` — maps every attachment down to
 * `{ storageKey }` before `OpenSupportRequestCommand` ever sees it, so the
 * other three values are discarded one hop after they arrive and reach no row,
 * no header and no reader. They are carried this far only so the client can
 * hand the upload route's answer back unchanged. If that ergonomic is ever
 * judged not worth the asymmetry, narrowing this to `{ storageKey }` means
 * following `DisputeAttachment` down with it — its own doc comment says so.
 *
 * **`attachments` takes three modifiers where one would look like enough, and
 * each earns its place at a different layer.** A dispute with no files is the
 * ordinary case, so both spellings of "no files" — omitting the key and
 * sending an explicit `null` — have to reach the handler as `[]`:
 *
 * - `.optional()` is the only one of the three that changes the **SDL**. The
 *   kit renders `required && !nullable` as `!`, and a bare `.default([])` is
 *   *required* in the generated JSON Schema (zod's default output semantics:
 *   a defaulted field is always present after parsing). So `.default([])`
 *   alone renders `[BookingDisputeInput_Attachments_Item]!` and a document
 *   that omits the key is refused at coercion, before any resolver runs.
 * - `.nullable()` is what lets an explicit `attachments: null` past coercion.
 *   On its own it is **not** enough to drop the `!` here — verified, not
 *   assumed: `.nullable().default([])` still renders non-null, because the
 *   field stays `required` in the JSON Schema and the kit's `isNullable`
 *   check does not fire on the `nullable: true` that the OpenAPI-3.0 target
 *   emits for an array.
 * - `.default([])` is what turns an *omitted* key into `[]` rather than
 *   `undefined`, which is what `DisputeBookingInput.attachments` — required,
 *   non-nullable — needs.
 *
 * The handler still writes `?? []`, and it is not redundant: `.nullable()`
 * means an explicit `null` parses to `null`, and collapsing the wire's two
 * ways of saying "nothing" into the domain's one is this boundary's job — the
 * same argument `booking.submit`'s `description` makes about itself.
 *
 * `write/booking`'s own test pins the rendered SDL line and the JSON Schema's
 * `required` list, because prose in this comment is exactly what silently
 * became false the first time this field was written.
 */
export const disputeBooking = defineMutation({
  input: zodSchema(
    z.object({
      bookingId: z.string().min(1),
      message: z.string().trim().min(1).max(2000),
      attachments: z
        .array(
          z.object({
            storageKey: z.string().min(1),
            fileName: z.string().min(1),
            contentType: z.string().min(1),
            sizeBytes: z.number().int().positive(),
          }),
        )
        .max(5)
        .nullable()
        .default([])
        .optional(),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1), threadId: z.string().min(1) })),
  docs: { summary: "Dispute a booking inside its window", tags: ["Booking"] },
});

/**
 * An administrator closing a booking the provider left open. The same hop, a
 * different door.
 *
 * It reaches the very same `MarkBookingDoneCommand` as `booking.markDone`
 * above — the difference is one hardcoded token, and that token is the one the
 * command's membership check exempts. Which is precisely why this door has to
 * be guarded here: the command's own check will not run for it. See the
 * handler's `requireAdmin`, which is this field's entire security surface.
 */
export const adminMarkBookingDone = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Close a booking on the provider's behalf", tags: ["Booking", "Admin"] },
});

/**
 * An administrator ending a window early, for a booking nobody is going to
 * answer.
 *
 * `CompleteBookingCommand` carries no authorisation of its own, deliberately
 * and by its own doc comment's instruction — its three callers (the sweep, the
 * review context, an administrator) are each authorised at their own edge.
 * This field *is* that edge for the third of them, and it is the only thing
 * between a signed-in stranger and every booking's payout.
 */
export const adminCompleteBooking = defineMutation({
  input: zodSchema(z.object({ bookingId: z.string().min(1) })),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Complete a booking without waiting out its window", tags: ["Booking", "Admin"] },
});

/**
 * An administrator decides a dispute: `upheld` sides with the customer and
 * cancels under `dispute_upheld`, `false` lets the completion stand.
 *
 * A single mutation carrying a boolean rather than an uphold/reject pair — the
 * shape `review.setFeatured` already uses, and for the reason its own doc
 * comment gives: a decision whose two outcomes are two endpoints makes every
 * caller ask which state it is in before acting, and get it wrong under a race.
 *
 * `note` is what the administrator wants both sides told; it is a *copy*
 * carried into the notifications, not the record — the record is the message
 * they leave on the dispute's own thread. `.nullable().default(null)` so an
 * omitted key and an explicit null are the one thing
 * `ResolveBookingDisputeInput.note` has, rather than a third state the command
 * would have to reconcile. No `.min(1)`: an empty note is the same fact as no
 * note, and the default is what turns it into one.
 *
 * **Nothing sends it today, and nothing enforces the record it defers to.**
 * The administrator queue's `RESOLVE_DISPUTE` document
 * (`features/admin/bookings/data/admin-booking.repository.ts`) sends
 * `bookingId` and `upheld` only, so `note` is null in both notifications; and
 * no schema, handler or page requires the thread message this field calls the
 * real record to exist at all. A caller may therefore supply words that live
 * nowhere but a notification payload, which nothing consumes yet. Follow-up
 * #182 carries both halves.
 *
 * Tagged `Admin` alongside its two siblings above even though it does not
 * carry `admin` in its name — the command it drives takes an `adminUserId` and
 * holds no check of its own.
 */
export const resolveBookingDispute = defineMutation({
  input: zodSchema(
    z.object({
      bookingId: z.string().min(1),
      upheld: z.boolean(),
      note: z.string().trim().max(2000).nullable().default(null),
    }),
  ),
  output: zodSchema(z.object({ bookingId: z.string().min(1) })),
  docs: { summary: "Decide a dispute", tags: ["Booking", "Admin"] },
});

export const bookingWriteSchema = defineGraphQLSchema(
  {
    booking: {
      create: createBooking,
      submit: submitBooking,
      accept: acceptBooking,
      decline: declineBooking,
      markDone: markBookingDone,
      stillOngoing: keepBookingOpen,
      dispute: disputeBooking,
      adminMarkDone: adminMarkBookingDone,
      adminComplete: adminCompleteBooking,
      resolveDispute: resolveBookingDispute,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
