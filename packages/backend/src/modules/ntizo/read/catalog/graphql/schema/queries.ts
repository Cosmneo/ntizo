import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { categoryAdminReadModel } from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Every category with every translation, for the administration screen.
 * Guarded by the handler, which refuses anyone who is not an admin.
 */
export const listCategoriesForAdmin = defineQuery({
  input: zodSchema(z.object({ search: z.string().trim().max(120).optional() })),
  output: zodSchema(z.array(categoryAdminReadModel)),
  docs: { summary: "Every category, for administration", tags: ["Admin", "Catalog"] },
});

export const catalogReadSchema = defineGraphQLSchema(
  {
    category: {
      // `category.all` is NOT here: the customer-facing read lives on the
      // public tier, which is the mount the landing page talks to. A public
      // field inside this session-authed schema is one omission away from
      // leaking and one guard away from being unreachable.
      allForAdmin: listCategoriesForAdmin,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
