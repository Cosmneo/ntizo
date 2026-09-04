import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext, type NtizoGraphqlContext } from "../../../../graphql/context";
import type { BookingReadBootstrap } from "../../bootstrap";
import type { ProviderReadRepositoryPort } from "../../../provider/app/ports/outbound/provider-read.repository.port";
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

/**
 * Who may read a workspace's bookings: an administrator, or somebody who
 * belongs to it. The wallet's rule, and the wallet's order — the membership
 * check is a query, so it runs only when the cheaper role check has failed,
 * and the role is the session's resolved one, never anything the caller sent.
 */
export async function assertMayReadWorkspace(
  ctx: NtizoGraphqlContext,
  providerId: string,
  providerRead: Pick<ProviderReadRepositoryPort, "isMember">,
): Promise<string> {
  const { requesterUserId, role } = ctx;
  if (!requesterUserId) {
    throw new ForbiddenError({ message: "Sign in to see a workspace's bookings", code: "UNAUTHENTICATED" });
  }
  const allowed = role === "admin" || (await providerRead.isMember(providerId, requesterUserId));
  if (!allowed) {
    throw new ForbiddenError({
      message: "These bookings belong to a workspace you are not part of",
      code: "NOT_PROVIDER_MEMBER",
    });
  }
  return requesterUserId;
}

export function createBookingReadHandlers(mod: BookingReadModule) {
  const uc = mod.bookingRead.useCases;

  return graphqlRoutes(bookingReadSchema)
    .handle("booking.mine", async (args, ctx) =>
      uc.listMine.execute({
        // Never from the client — see the schema's own doc comment for why
        // there is no `customerId` field to read instead.
        customerId: requireUser(ctx),
        tab: args.input.tab,
        limit: args.input.limit ?? 20,
        offset: args.input.offset ?? 0,
        now: new Date(),
      }),
    )
    .handle("booking.byId", async (args, ctx) =>
      uc.getMine.execute({
        bookingId: args.input.bookingId,
        customerId: requireUser(ctx),
        now: new Date(),
      }),
    )
    .handle("booking.forProvider", async (args, ctx) => {
      await assertMayReadWorkspace(asNtizoGraphqlContext(ctx), args.input.providerId, uc.providerRead);
      return uc.listForProvider.execute({
        providerId: args.input.providerId,
        tab: args.input.tab,
        q: args.input.q ?? null,
        memberId: args.input.memberId ?? null,
        limit: args.input.limit ?? 20,
        offset: args.input.offset ?? 0,
        now: new Date(),
      });
    })
    .handle("booking.byIdForProvider", async (args, ctx) => {
      await assertMayReadWorkspace(asNtizoGraphqlContext(ctx), args.input.providerId, uc.providerRead);
      return uc.getForProvider.execute({
        providerId: args.input.providerId,
        bookingId: args.input.bookingId,
        now: new Date(),
      });
    })
    .handle("booking.statsForProvider", async (args, ctx) => {
      await assertMayReadWorkspace(asNtizoGraphqlContext(ctx), args.input.providerId, uc.providerRead);
      return uc.statsForProvider.execute({ providerId: args.input.providerId, now: new Date() });
    })
    .build();
}
