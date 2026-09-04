import {
  graphqlRoutes,
  type GraphQLHandlerContext,
} from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { BookingBootstrap } from "../../../../bounded-contexts/booking/bootstrap";
import { bookingWriteSchema } from "../schema/mutations";

export interface BookingWriteModule {
  readonly booking: BookingBootstrap;
}

/**
 * Refuses an anonymous caller. Everything else — the option must exist, the
 * service must be published, the option must be active and fixed-price, the
 * provider must exist — is the command's job, because each of those is a
 * database read and the kit's argsMapper is synchronous.
 *
 * Copied rather than imported from the review handlers: tiers do not import
 * each other here, and a shared helper is not worth introducing for six
 * lines.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({ message: "Sign in to book a service", code: "UNAUTHENTICATED" });
  }
  return requesterUserId;
}

/**
 * Refuses anyone whose platform role is not `admin`, and answers with the
 * administrator's own id — every command behind the three fields that use it
 * wants a name against the decision.
 *
 * Both the id and the role, not the role alone: `NtizoGraphqlContext` defaults
 * a caller with no session to `customer`, so a role check by itself would be
 * reading a value chosen for the *absence* of a user rather than asserted
 * about one. `ForbiddenError` with `ADMIN_ONLY`, the same shape and the same
 * code `write/support`, `write/contact`, `write/catalog`, `write/provider` and
 * `write/review` all use — copied rather than shared for the reason
 * `requireUser` above already is.
 *
 * **This function is the entire security surface of the three fields below
 * it.** `CompleteBookingCommand` and `ResolveBookingDisputeCommand` hold no
 * authorisation of their own by design (both say so in their own doc
 * comments), and `MarkBookingDoneCommand` deliberately skips its membership
 * check for the `marked_done_by_admin` reason `booking.adminMarkDone` passes.
 * There is no second check further in to catch a mistake made here.
 */
function requireAdmin(ctx: GraphQLHandlerContext): string {
  const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId || role !== "admin") {
    throw new ForbiddenError({
      message: "Only administrators may close or decide a booking",
      code: "ADMIN_ONLY",
    });
  }
  return requesterUserId;
}

export function createBookingWriteHandlers(mod: BookingWriteModule) {
  const uc = mod.booking.useCases;

  return graphqlRoutes(bookingWriteSchema)
    .handle("booking.create", async (args, ctx) =>
      uc.createBooking.execute({
        // Never from the client — see the schema's own doc comment for why
        // there is no `customerId` field to read instead.
        customerId: requireUser(ctx),
        serviceOptionId: args.input.serviceOptionId,
        providerMemberId: args.input.providerMemberId,
        // The wire carries an ISO string; `CreateBookingInput.startsAt` is
        // typed `Date` and stays that way — the conversion belongs at this
        // boundary, not inside the command.
        startsAt: new Date(args.input.startsAt),
        locale: args.input.locale,
      }),
    )
    .handle("booking.submit", async (args, ctx) =>
      uc.submitBooking.execute({
        bookingId: args.input.bookingId,
        // Never from the client, for the same reason `booking.create`'s is
        // not — see the schema's own doc comment. The command checks it
        // against the booking's own `customerId` and refuses a stranger.
        customerId: requireUser(ctx),
        // Not from the client either, and for a second reason on top of that
        // one: the provider's "novo pedido" notification names the customer,
        // and a name the client could set is a name the client could forge.
        // `firstName` is `string | null` on the session — a profile without
        // one is ordinary, and the command passes the null straight through.
        customerFirstName: asNtizoGraphqlContext(ctx).firstName,
        address: args.input.address,
        // The wire has two ways to say "no description" — an explicit null
        // and an omitted key — and the domain has one. Collapsing them is
        // this boundary's job: `SubmitBookingInput.description` is
        // `string | null` and `Booking.submit` requires the argument, so
        // that a caller can never express "leave whatever was there".
        description: args.input.description ?? null,
      }),
    )
    .handle("booking.accept", async (args, ctx) => {
      await uc.acceptBooking.execute({ bookingId: args.input.bookingId, requesterUserId: requireUser(ctx) });
      return { bookingId: args.input.bookingId };
    })
    .handle("booking.decline", async (args, ctx) => {
      await uc.declineBooking.execute({
        bookingId: args.input.bookingId,
        requesterUserId: requireUser(ctx),
        // `undefined` reaches the command as "no reason given", which it
        // records as `declined_without_reason`.
        ...(args.input.reason ? { reason: args.input.reason } : {}),
      });
      return { bookingId: args.input.bookingId };
    })
    // The six hops that close a booking. Two rules hold across all of them,
    // and neither is style:
    //
    // **Every `reason` below is a literal written here, never read from
    // `args.input`.** `MarkBookingDoneCommand` skips its membership check for
    // `marked_done_by_admin` and `marked_done_by_platform`, and that exemption
    // is safe only while nothing maps a client's input onto a reason — which
    // is why no input on this schema has a `reason` field and why these two
    // handlers each spell their own token out. Mapping one from the wire here
    // would be a privilege escalation, not a refactor.
    //
    // **Every requester below is a real session user.** `requesterUserId:
    // null` does not fail closed in that command: it skips the membership
    // check entirely and records the platform as the actor. Null is the
    // sweep's value, and the sweep is not an edge — so `requireUser` and
    // `requireAdmin` both throw rather than ever answering with one.
    .handle("booking.markDone", async (args, ctx) => {
      await uc.markBookingDone.execute({
        bookingId: args.input.bookingId,
        requesterUserId: requireUser(ctx),
        // The one reason of the three that the command actually checks
        // membership for — which is what makes this the provider's door.
        reason: "marked_done_by_provider",
      });
      return { bookingId: args.input.bookingId };
    })
    .handle("booking.stillOngoing", async (args, ctx) => {
      await uc.keepBookingOpen.execute({
        bookingId: args.input.bookingId,
        requesterUserId: requireUser(ctx),
      });
      return { bookingId: args.input.bookingId };
    })
    .handle("booking.dispute", async (args, ctx) => {
      const { threadId } = await uc.disputeBooking.execute({
        bookingId: args.input.bookingId,
        // The command refuses anybody but the booking's own customer; this is
        // where the person it checks comes from.
        requesterUserId: requireUser(ctx),
        message: args.input.message,
        // Already defaulted to `[]` by the input schema — `DisputeBookingInput`
        // requires the list, so there is no `?? []` to write here.
        attachments: args.input.attachments,
      });
      // The thread id is the command's answer, and the only field on this
      // surface that is not an echo of the request.
      return { bookingId: args.input.bookingId, threadId };
    })
    .handle("booking.adminMarkDone", async (args, ctx) => {
      await uc.markBookingDone.execute({
        bookingId: args.input.bookingId,
        // Not null, though this reason skips the membership check either way:
        // `booking_change.changedByUserId` is how the timeline says *which*
        // administrator closed it, and null there means "no human did".
        requesterUserId: requireAdmin(ctx),
        reason: "marked_done_by_admin",
      });
      return { bookingId: args.input.bookingId };
    })
    .handle("booking.adminComplete", async (args, ctx) => {
      await uc.completeBooking.execute({
        bookingId: args.input.bookingId,
        reason: "completed_by_admin",
        changedByUserId: requireAdmin(ctx),
      });
      return { bookingId: args.input.bookingId };
    })
    .handle("booking.resolveDispute", async (args, ctx) => {
      await uc.resolveBookingDispute.execute({
        bookingId: args.input.bookingId,
        adminUserId: requireAdmin(ctx),
        upheld: args.input.upheld,
        // Already collapsed to `string | null` by the input schema's
        // `.nullable().default(null)`, which is why there is no `?? null` here
        // as `booking.submit`'s description has.
        note: args.input.note,
      });
      return { bookingId: args.input.bookingId };
    })
    .build();
}
