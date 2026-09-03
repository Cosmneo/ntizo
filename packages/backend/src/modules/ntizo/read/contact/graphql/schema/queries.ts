import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { contactRequestKindSchema, contactRequestStatusSchema } from "@ntizo/shared";
import { contactRequestAdminPageReadModel } from "@ntizo/shared/read-models";
import { MAX_ADMIN_LIMIT } from "../../../../bounded-contexts/contact/app/use-cases/list-contact-requests-for-admin.query";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/** The contact queue. Guarded by the handler, which refuses anyone who is not an admin. */
export const listContactRequestsForAdmin = defineQuery({
  input: zodSchema(
    z.object({
      // Optional, not `.default()` — a zod default does not survive into the emitted schema.
      limit: z.number().int().min(1).max(MAX_ADMIN_LIMIT).optional(),
      offset: z.number().int().min(0).optional(),
      kind: contactRequestKindSchema.optional(),
      status: contactRequestStatusSchema.optional(),
      // Bounded: the string ends up in a LIKE pattern.
      search: z.string().trim().max(120).optional(),
    }),
  ),
  output: zodSchema(contactRequestAdminPageReadModel),
  docs: { summary: "Every contact request, for administration", tags: ["Admin", "Contact"] },
});

export const contactReadSchema = defineGraphQLSchema(
  { contactRequest: { allForAdmin: listContactRequestsForAdmin } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
