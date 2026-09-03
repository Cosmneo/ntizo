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
    .handle("booking.cancel", async (args, ctx) => {
      await uc.cancelBooking.execute({ bookingId: args.input.bookingId, requesterUserId: requireUser(ctx) });
      return { bookingId: args.input.bookingId };
    })
    .build();
}
