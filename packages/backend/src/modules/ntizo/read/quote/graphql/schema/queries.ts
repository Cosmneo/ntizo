import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { CUSTOMER_QUOTE_TABS, PROVIDER_QUOTE_TABS } from "@ntizo/shared";
import {
  customerQuoteDetailReadModel,
  customerQuotePageReadModel,
  providerQuoteCountsReadModel,
  providerQuoteDetailReadModel,
  providerQuotePageReadModel,
} from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * One tab of the caller's own quotes, paged, with the two tab counts.
 *
 * Takes no customer id — it resolves from the session, so there is nothing to
 * tamper with, and the repository puts it *inside* the `WHERE` rather than
 * checking it after the read. `booking.mine` is the same field for the same
 * reason.
 */
export const listMyQuotes = defineQuery({
  input: zodSchema(
    z.object({
      tab: z.enum(CUSTOMER_QUOTE_TABS),
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  ),
  output: zodSchema(customerQuotePageReadModel),
  docs: { summary: "Your own quotes, one tab at a time", tags: ["Quote"] },
});

/**
 * One of the caller's own quotes, by id.
 *
 * No customer id here either, for the reason `mine` has none. The output is
 * nullable and covers two cases without distinguishing them: no such quote,
 * and one that is not the caller's. Telling an unrelated caller which it was
 * would confirm that a given id names a real quote.
 */
export const getMyQuote = defineQuery({
  input: zodSchema(z.object({ quoteId: z.string().min(1) })),
  output: zodSchema(customerQuoteDetailReadModel.nullable()),
  docs: { summary: "One of your own quotes", tags: ["Quote"] },
});

/**
 * A workspace's quotes, one tab at a time. `providerId` is explicit, as it is
 * on the wallet's and the booking list's reads: a person may belong to
 * several workspaces and the shell knows which one is active. Who may ask is
 * decided in the handler — a member of the workspace, or an administrator.
 *
 * The items are `providerQuoteReadModel`, which carries the district and the
 * city of the job and no more of the address than that. See
 * `to-provider-quote-dto.ts` for why that is the read model's shape rather
 * than a screen's discipline.
 */
export const listProviderQuotes = defineQuery({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      tab: z.enum(PROVIDER_QUOTE_TABS),
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  ),
  output: zodSchema(providerQuotePageReadModel),
  docs: { summary: "A workspace's quotes, by tab", tags: ["Quote"] },
});

/** One of the workspace's quotes. Null covers "no such quote" and "not yours" alike, as `quote.byId` does. */
export const getProviderQuote = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1), quoteId: z.string().min(1) })),
  output: zodSchema(providerQuoteDetailReadModel.nullable()),
  docs: { summary: "One of a workspace's quotes", tags: ["Quote"] },
});

/**
 * How many requests are waiting for this workspace to answer — the badge the
 * shell draws on every screen, and the reason it is not a `forProvider` read
 * with `limit: 1`.
 */
export const providerQuoteCounts = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(providerQuoteCountsReadModel),
  docs: { summary: "How many quotes a workspace has to answer", tags: ["Quote"] },
});

/**
 * Nested one level, like `booking`'s: the field kit flattens these to
 * `quoteMine`, `quoteById`, `quoteForProvider`, `quoteByIdForProvider` and
 * `quoteCountsForProvider` on the wire — `{ quote: { mine } }` → `quoteMine`,
 * never `quote.mine`. Sits alongside `write/quote`'s
 * `quote: { request, propose, decline, reject, withdraw, accept }`, which
 * flattens the same way; the two groups merge into one `quote` without
 * colliding because they name different leaves.
 */
export const quoteReadSchema = defineGraphQLSchema(
  {
    quote: {
      mine: listMyQuotes,
      byId: getMyQuote,
      forProvider: listProviderQuotes,
      byIdForProvider: getProviderQuote,
      countsForProvider: providerQuoteCounts,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
