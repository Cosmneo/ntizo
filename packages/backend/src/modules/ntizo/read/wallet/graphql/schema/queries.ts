import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { walletWithHistoryReadModel } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * A workspace's balance and its ledger.
 *
 * One query for both zones rather than two. The provider reads its own and an
 * administrator reads anybody's, but the *answer* is identical — only who may
 * ask differs, and duplicating the read to express that would be two
 * projections that have to stay in step forever.
 */
export const getProviderWallet = defineQuery({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  ),
  output: zodSchema(walletWithHistoryReadModel),
  docs: { summary: "A workspace's balance and ledger", tags: ["Wallet"] },
});

export const walletReadSchema = defineGraphQLSchema(
  { wallet: { forProvider: getProviderWallet } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
