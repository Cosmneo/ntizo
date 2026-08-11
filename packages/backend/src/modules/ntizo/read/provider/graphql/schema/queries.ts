import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import {
  providerAdminReadModel,
  providerDetailReadModel,
  providerListItemReadModel,
} from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";


/**
 * READ-side GraphQL schema for the provider BC. Queries ONLY — the
 * read=queries-only fitness gate (Task 7) asserts this.
 */
export const listMyProviders = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(z.array(providerListItemReadModel)),
  docs: {
    summary: "Providers the authenticated user belongs to",
    tags: ["Provider"],
  },
});

export const getProviderDetail = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(providerDetailReadModel),
  docs: {
    summary: "Provider detail with members and invites",
    tags: ["Provider"],
  },
});

/**
 * Every provider, for the administration area.
 *
 * Paged and filterable server-side, because a review queue is the one screen
 * that grows without bound and the browser is the wrong place to decide which
 * fifty of ten thousand applications to draw.
 *
 * Guarded by the handler, which refuses anyone whose platform role is not
 * `admin` — the route that led here is an affordance, not the control.
 */
export const listProvidersForAdmin = defineQuery({
  input: zodSchema(
    z.object({
      /** Absent means every status — the queue's "all" tab, not "none". */
      status: z.string().trim().max(40).optional(),
      search: z.string().trim().max(120).optional(),
      // Optional, not `.default()`. A zod default does not survive into
      // GraphQL — the field still emits as `Int!` and every caller has to send
      // it. The real default and the clamp both live in the projection.
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    }),
  ),
  output: zodSchema(z.array(providerAdminReadModel)),
  docs: { summary: "Every provider, for administration", tags: ["Admin"] },
});

export const providerReadSchema = defineGraphQLSchema(
  {
    provider: {
      mine: listMyProviders,
      byId: getProviderDetail,
      allForAdmin: listProvidersForAdmin,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
