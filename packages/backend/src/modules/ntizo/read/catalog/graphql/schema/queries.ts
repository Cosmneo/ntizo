import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { categoryAdminReadModel, serviceOwnerReadModel } from "@ntizo/shared/read-models";
import { serviceStatusSchema } from "@ntizo/shared";
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

/**
 * A provider's own services, every option and every translation. Guarded by
 * the handler, which refuses anyone who is not a member of the workspace.
 */
export const listMyServices = defineQuery({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      status: serviceStatusSchema.optional(),
    }),
  ),
  output: zodSchema(z.array(serviceOwnerReadModel)),
  docs: { summary: "A provider's own services", tags: ["Catalog"] },
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
    service: {
      mine: listMyServices,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
