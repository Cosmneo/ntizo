import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { BookingReadBootstrap } from "../../bootstrap";
import { bookingReadSchema } from "../schema/queries";

export interface BookingReadModule {
  readonly bookingRead: BookingReadBootstrap;
}

/**
 * Somebody's own bookings, so the field refuses an anonymous caller before
 * anything else runs. Copied rather than imported from
 * `write/booking`'s equivalent — tiers do not import each other here, and
 * six lines is not worth a shared helper. Matches `read/activity`'s and
 * `read/notification`'s own copies of the same six lines.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({
      message: "Sign in to see your bookings",
      code: "UNAUTHENTICATED",
    });
  }
  return requesterUserId;
}

export function createBookingReadHandlers(mod: BookingReadModule) {
  const uc = mod.bookingRead.useCases;

  return graphqlRoutes(bookingReadSchema)
    .handle("booking.mine", async (_args, ctx) =>
      uc.listMine.execute({
        // Never from the client — see the schema's own doc comment for why
        // there is no `customerId` field to read instead.
        customerId: requireUser(ctx),
      }),
    )
    .handle("booking.byId", async (args, ctx) =>
      uc.getMine.execute({
        bookingId: args.input.bookingId,
        customerId: requireUser(ctx),
      }),
    )
    .build();
}
