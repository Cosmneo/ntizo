import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { availabilityConfigReadModel } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * The provider's own availability configuration — every member's week and
 * exceptions, the workspace's closures and its timezone, in one response.
 *
 * `providerId` only. There is deliberately no `memberId` to narrow the
 * member list: the person picker on the availability screen needs every
 * member to draw itself, and fetching each member's week on selection would
 * turn switching people into a network round trip for data measured in
 * dozens of rows.
 */
export const getAvailabilityConfig = defineQuery({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(availabilityConfigReadModel),
  docs: { summary: "A provider's own availability configuration", tags: ["Scheduling"] },
});

export const availabilityReadSchema = defineGraphQLSchema(
  { availability: { config: getAvailabilityConfig } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
