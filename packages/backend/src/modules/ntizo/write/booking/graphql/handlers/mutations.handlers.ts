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
        address: args.input.address,
        description: args.input.description,
      }),
    )
    .build();
}
