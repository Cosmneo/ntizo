import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { QuoteBootstrap } from "../../../../bounded-contexts/quote/bootstrap";
import { quoteWriteSchema } from "../schema/mutations";

export interface QuoteWriteModule {
  readonly quote: QuoteBootstrap;
}

/**
 * Refuses an anonymous caller. Everything else — whether the caller belongs
 * to the quote's provider workspace, whether they are the quote's own
 * customer, whether the quote is even in a state that can be acted on — is a
 * command's job, because each of those is a database read and the kit's
 * argsMapper is synchronous.
 *
 * Copied rather than imported from `write/booking`'s equivalent: tiers do not
 * import each other here, and a shared helper is not worth introducing for
 * six lines — see that file's own doc comment for the same call made there.
 */
function requireUser(ctx: GraphQLHandlerContext): string {
  const { requesterUserId } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId) {
    throw new ForbiddenError({ message: "Sign in to ask for a quote", code: "UNAUTHENTICATED" });
  }
  return requesterUserId;
}

/**
 * The six mutations a quote's two sides can send. Every one of them takes its
 * actor from `requireUser(ctx)` — never from `args.input` — and every one of
 * them lets its command's own exception reach the client under its own code;
 * nothing here catches and re-wraps.
 *
 * `quote.propose` is the one handler with something to say about its return:
 * `ProposeQuoteCommand.execute` answers `null` when the compare-and-swap
 * lost — a colleague's proposal already landed — and that is not a failure to
 * report. The fallback below answers with the id the caller asked about and a
 * `null` validity, exactly the shape a proposal that never went live should
 * have. See the schema's own doc comment on `proposeQuote` for the fuller
 * argument.
 *
 * `quote.decline`, `quote.reject` and `quote.withdraw` can lose the very same
 * kind of race — `closeQuote`'s compare-and-swap answers `null` the same way
 * — and, on reflection, losing it is *not* always the caller's own intended
 * end-state: `Quote.decline` is legal from either open state, so a colleague's
 * `propose` racing a `decline` can move the quote to `PROPOSED` while the
 * decline transition still succeeds in memory, with the *save* the one thing
 * that fails. Reporting success there would tell a provider they declined a
 * request that is now a live proposal, or tell a customer they withdrew a
 * request the provider just declined. So these three answer the same way
 * `quote.propose` does: the id, plus `applied: false` when this call's own
 * transition did not land — never an error, because nothing about the
 * caller's own request was invalid; the ground just moved under it.
 */
export function createQuoteWriteHandlers(mod: QuoteWriteModule) {
  const uc = mod.quote.useCases;

  return graphqlRoutes(quoteWriteSchema)
    .handle("quote.request", async (args, ctx) =>
      uc.requestQuote.execute({
        // Never from the client — see the schema's own doc comment for why
        // there is no `customerId` field to read instead.
        customerId: requireUser(ctx),
        serviceId: args.input.serviceId,
        description: args.input.description,
        neededBy: args.input.neededBy ?? null,
        address: args.input.address
          ? {
              label: args.input.address.label,
              line: args.input.address.line,
              city: args.input.address.city,
              district: args.input.address.district ?? null,
              directions: args.input.address.directions ?? null,
              lat: args.input.address.lat ?? null,
              lng: args.input.address.lng ?? null,
            }
          : null,
        attachments: args.input.attachments ?? [],
        locale: args.input.locale,
      }),
    )
    .handle("quote.propose", async (args, ctx) => {
      const result = await uc.proposeQuote.execute({
        quoteId: args.input.quoteId,
        // Never from the client — the provider *member* is `providerMemberId`
        // below, which may be a colleague; the caller's own membership in
        // that workspace is what `requireUser` plus the command's own check
        // decide.
        requesterUserId: requireUser(ctx),
        priceMinor: args.input.priceMinor,
        // The wire carries an ISO string; `ProposeQuoteInput.startsAt` is
        // typed `Date` and stays that way — the conversion belongs at this
        // boundary, not inside the command.
        startsAt: new Date(args.input.startsAt),
        durationMinutes: args.input.durationMinutes,
        providerMemberId: args.input.providerMemberId,
        note: args.input.note ?? null,
        attachments: args.input.attachments ?? [],
      });
      // `null` is a lost compare-and-swap, not a failure — see this file's
      // own doc comment.
      return result ?? { quoteId: args.input.quoteId, validUntil: null };
    })
    .handle("quote.decline", async (args, ctx) => {
      const result = await uc.declineQuote.execute({
        quoteId: args.input.quoteId,
        requesterUserId: requireUser(ctx),
        reason: args.input.reason,
        note: args.input.note ?? null,
        attachments: args.input.attachments ?? [],
      });
      // `null` is a lost compare-and-swap, not a failure — see this file's
      // own doc comment.
      return { quoteId: args.input.quoteId, applied: result !== null };
    })
    .handle("quote.reject", async (args, ctx) => {
      const result = await uc.rejectQuote.execute({
        quoteId: args.input.quoteId,
        requesterUserId: requireUser(ctx),
        reason: args.input.reason,
        note: args.input.note ?? null,
        attachments: args.input.attachments ?? [],
      });
      return { quoteId: args.input.quoteId, applied: result !== null };
    })
    .handle("quote.withdraw", async (args, ctx) => {
      const result = await uc.withdrawQuote.execute({
        quoteId: args.input.quoteId,
        requesterUserId: requireUser(ctx),
        note: args.input.note ?? null,
        attachments: args.input.attachments ?? [],
      });
      return { quoteId: args.input.quoteId, applied: result !== null };
    })
    .handle("quote.accept", async (args, ctx) =>
      uc.acceptQuote.execute({
        quoteId: args.input.quoteId,
        requesterUserId: requireUser(ctx),
        address: args.input.address
          ? {
              label: args.input.address.label,
              line: args.input.address.line,
              city: args.input.address.city,
              district: args.input.address.district ?? null,
              directions: args.input.address.directions ?? null,
              lat: args.input.address.lat ?? null,
              lng: args.input.address.lng ?? null,
            }
          : null,
      }),
    )
    .build();
}
