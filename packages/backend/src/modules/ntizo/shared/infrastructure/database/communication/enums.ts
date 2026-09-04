/**
 * Phase 1 shipped `inquiry`; phase 2 (this plan) adds `support`. Oversight
 * (phase 3) adds nothing here — an admin reading a private conversation is a
 * question of access, not a new kind of thread.
 */
export const THREAD_TYPES = ["inquiry", "support"] as const;
export type ThreadType = (typeof THREAD_TYPES)[number];

/**
 * Which side of a conversation a message came from, written at send time by
 * the command that inserted it. `customer` and `provider` are the two sides
 * of an inquiry and the requester's side of a support request (by audience);
 * `platform` is an admin answering a support request. Never inferred from
 * the sender's role: a person's role can change, a message's side cannot.
 */
export const SENDER_SIDES = ["customer", "provider", "platform"] as const;
export type SenderSide = (typeof SENDER_SIDES)[number];

/** Who a support request was opened on behalf of: the person, or a provider they belong to. */
export const SUPPORT_AUDIENCES = ["customer", "provider"] as const;
export type SupportAudience = (typeof SUPPORT_AUDIENCES)[number];

/** Two states, on purpose — see the spec's "Domain and use cases". */
export const SUPPORT_STATUSES = ["open", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/**
 * What a support request *is*: an ordinary question, or a customer's dispute
 * over a booking.
 *
 * A column rather than an inference from "has a booking id", because
 * resolving a dispute moves a booking and resolving a support request must
 * not — and the first person to ask an ordinary question about a booking they
 * are also disputing would break any rule that guessed. Mirrors the
 * `support_request_kind_known` check constraint in `support-request.schema.ts`;
 * the database is what actually refuses a third value, and
 * `support-request.repository.test.ts` proves it does.
 */
export const SUPPORT_KINDS = ["support", "dispute"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];
