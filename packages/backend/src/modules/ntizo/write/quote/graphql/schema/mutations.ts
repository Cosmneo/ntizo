import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { QUOTE_CUSTOMER_REJECT_REASONS, QUOTE_PROVIDER_DECLINE_REASONS } from "@ntizo/shared";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * The same address shape `bookingSubmit` takes: the client sends the fields
 * themselves, not an id into the address book. A deliberate divergence from
 * the design document, recorded in the plan — following `booking.submit`'s
 * own choice avoids a new cross-context reader on this write path, the same
 * argument that field's own schema comment makes.
 */
const addressInput = z.object({
  label: z.string().trim().min(1),
  line: z.string().trim().min(1),
  city: z.string().trim().min(1),
  district: z.string().trim().min(1).nullable().optional(),
  directions: z.string().trim().max(500).nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

/** The upload route's answer, unchanged — see `write/booking`'s schema comment for the fuller argument for why only `storageKey` travels here. */
const attachmentsInput = z.array(z.object({ storageKey: z.string().min(1) })).max(5).optional();

/**
 * The customer describes a job and asks one provider to price it.
 *
 * **There is no `customerId` field.** The customer comes from
 * `requireUser(ctx)` in the handler, never from this input — a field here
 * would make this the mutation that asks for a quote on someone else's
 * behalf. `serviceId` names the provider, indirectly: `RequestQuoteCommand`
 * reads it off the service.
 *
 * **`address` is fields, not an id.** See this file's `addressInput` comment.
 * Whether an address is required at all is the service's own rule
 * (`RequestQuoteCommand` reads `askLocation` and `locationType`), not this
 * schema's — this is the edge's cheap shape check, the command is where the
 * requirement is enforced.
 */
export const requestQuote = defineMutation({
  input: zodSchema(
    z.object({
      serviceId: z.string().min(1),
      description: z.string().trim().min(1).max(4000),
      /** `YYYY-MM-DD`, advisory only: the provider proposes whatever date they can manage. */
      neededBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      address: addressInput.nullable().optional(),
      attachments: attachmentsInput,
      /** The locale the customer was reading the page in — the service name is snapshotted in it. */
      locale: z.string().min(2),
    }),
  ),
  output: zodSchema(z.object({ quoteId: z.string().min(1), respondBy: z.string() })),
  docs: { summary: "Ask one provider to price a job", tags: ["Quote"] },
});

/**
 * The provider answers with a price, a date, a duration and a member — a
 * complete agreement, so the booking it may become is indistinguishable from
 * a priced one.
 *
 * **There is no `requesterUserId` field.** The proposing member comes from
 * `requireUser(ctx)`; `providerMemberId` names who does the *work*, which may
 * be a colleague — `ProposeQuoteCommand` checks the caller's membership in
 * the workspace before checking anything about that colleague.
 *
 * **`validUntil` is `null` when the compare-and-swap lost.** Two members of
 * one workspace pressing "send" at the same moment is ordinary; the loser's
 * proposal did not happen and the winner's stands, so this is not an error —
 * an error would report a failure that did not occur. It is also not a
 * fabricated deadline: a `validUntil` invented here would be a lie the screen
 * renders as a countdown on a proposal that was never live. `null` is what
 * says "nothing of yours is counting down."
 */
export const proposeQuote = defineMutation({
  input: zodSchema(
    z.object({
      quoteId: z.string().min(1),
      priceMinor: z.number().int().positive(),
      startsAt: z.string().datetime(),
      durationMinutes: z.number().int().positive().max(24 * 60),
      providerMemberId: z.string().min(1),
      note: z.string().trim().max(2000).nullable().optional(),
      attachments: attachmentsInput,
    }),
  ),
  output: zodSchema(z.object({ quoteId: z.string().min(1), validUntil: z.string().nullable() })),
  docs: { summary: "Answer a request with a price, a date and a duration", tags: ["Quote"] },
});

/**
 * The provider's no, from either open state: a request they will not price,
 * or a proposal they are taking back. Both land on `DECLINED` — from the
 * customer's side they are the same news, this provider is not doing it.
 *
 * No `requesterUserId` field, for the same reason `proposeQuote` has none:
 * the member comes from `requireUser(ctx)`, and `DeclineQuoteCommand` checks
 * their membership in the quote's own workspace.
 */
export const declineQuote = defineMutation({
  input: zodSchema(
    z.object({
      quoteId: z.string().min(1),
      reason: z.enum(QUOTE_PROVIDER_DECLINE_REASONS),
      note: z.string().trim().max(2000).nullable().optional(),
      attachments: attachmentsInput,
    }),
  ),
  output: zodSchema(z.object({ quoteId: z.string().min(1) })),
  docs: { summary: "Refuse a request, or take a proposal back", tags: ["Quote"] },
});

/**
 * The customer refuses a priced proposal. Only reachable from `PROPOSED` — a
 * request with no proposal yet is `withdraw`n instead.
 *
 * No `requesterUserId` field: the customer comes from `requireUser(ctx)`, and
 * `RejectQuoteCommand` checks them directly against the quote's own
 * `customerId` — no member reader, because there is no workspace to be a
 * member of on this side.
 */
export const rejectQuote = defineMutation({
  input: zodSchema(
    z.object({
      quoteId: z.string().min(1),
      reason: z.enum(QUOTE_CUSTOMER_REJECT_REASONS),
      note: z.string().trim().max(2000).nullable().optional(),
      attachments: attachmentsInput,
    }),
  ),
  output: zodSchema(z.object({ quoteId: z.string().min(1) })),
  docs: { summary: "Refuse a proposal", tags: ["Quote"] },
});

/**
 * The customer takes the request back before it is answered. Only from
 * `REQUESTED` — once a proposal exists there is a price to refuse, and the
 * customer `reject`s instead.
 *
 * No `reason` field: there is only one reason a customer withdraws, and the
 * aggregate records it as the fixed token `"withdrawn"`. No `requesterUserId`
 * field either, for the same reason `rejectQuote` has none.
 */
export const withdrawQuote = defineMutation({
  input: zodSchema(
    z.object({
      quoteId: z.string().min(1),
      note: z.string().trim().max(2000).nullable().optional(),
      attachments: attachmentsInput,
    }),
  ),
  output: zodSchema(z.object({ quoteId: z.string().min(1) })),
  docs: { summary: "Take a request back before it is answered", tags: ["Quote"] },
});

/**
 * Accepting is paying: this is the one act that turns a proposal into a
 * booking already waiting for payment.
 *
 * **No `requesterUserId` field**, for the same reason as every field above:
 * the customer comes from `requireUser(ctx)`, and `AcceptQuoteCommand` checks
 * them directly against the quote's own `customerId`.
 *
 * **`address` is supplied only when the request carried none.** A quote whose
 * service did not require one on request may still need one before it can
 * become a booking — the same fields as `requestQuote.address`, reused rather
 * than duplicated under a different shape.
 */
export const acceptQuote = defineMutation({
  input: zodSchema(z.object({ quoteId: z.string().min(1), address: addressInput.nullable().optional() })),
  output: zodSchema(z.object({ bookingId: z.string().min(1), payBy: z.string() })),
  docs: { summary: "Accept a proposal — creates the booking and pushes the payment", tags: ["Quote"] },
});

export const quoteWriteSchema = defineGraphQLSchema(
  {
    quote: {
      request: requestQuote,
      propose: proposeQuote,
      decline: declineQuote,
      reject: rejectQuote,
      withdraw: withdrawQuote,
      accept: acceptQuote,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
