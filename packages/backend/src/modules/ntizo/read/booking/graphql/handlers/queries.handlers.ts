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

/**
 * Refuses anyone whose platform role is not `admin`.
 *
 * Both the id and the role, not the role alone: `NtizoGraphqlContext` defaults
 * a caller with no session to `customer`, so a role check by itself would be
 * reading a value chosen for the *absence* of a user rather than asserted
 * about one. `ForbiddenError` with `ADMIN_ONLY`, the same shape and the same
 * code `write/booking`, `write/support`, `write/contact`, `write/catalog`,
 * `write/provider` and `write/review` all use — copied rather than shared for
 * the reason `requireUser` above already is.
 *
 * Answers nothing, unlike `write/booking`'s: that one names the administrator
 * against a decision, and a read makes no decision to sign.
 *
 * **One refusal, thrown before anything is read.** The queue it guards spans
 * every workspace on the platform, so a refusal that varied by caller — a
 * different message, a different code, or a read that ran first and failed
 * afterwards — would be an oracle: it would let somebody who may not see the
 * queue learn what is in it from the shape of being turned away. The four
 * refusable callers (signed out, customer, provider, and an `admin` role with
 * no user behind it) are refused identically, and
 * `queries.handlers.test.ts` asserts that they are.
 *
 * **This function is the entire security surface of the field below it.**
 * `ListAdminBookingsProjection` takes no requester and
 * `BookingReadRepositoryPort.listForAdmin` takes no owner id, both by design
 * — see that port's own doc comment. There is no second check further in.
 */
function requireAdmin(ctx: GraphQLHandlerContext): void {
  const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId || role !== "admin") {
    throw new ForbiddenError({
      message: "Only administrators may read the booking queue",
      code: "ADMIN_ONLY",
    });
  }
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
    .handle("booking.needsAttentionForAdmin", async (args, ctx) => {
      // First line of the handler, deliberately: the read below spans every
      // workspace, so nothing may run before the caller is known to be an
      // administrator. See `requireAdmin`.
      requireAdmin(ctx);
      return uc.listForAdmin.execute({
        tab: args.input.tab,
        limit: args.input.limit ?? 20,
        offset: args.input.offset ?? 0,
        // The edge's instant, so `unclosed` is a question about now rather
        // than about whenever the query happened to reach Postgres.
        now: new Date(),
      });
    })
    .build();
}
