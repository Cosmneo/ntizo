import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import {
  messagePageReadModel,
  supportRequestPageReadModel,
  supportRequestSummaryReadModel,
} from "@ntizo/shared/read-models";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

const paging = {
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().optional(),
};

/** The queue. Guarded by the handler: administrators only. */
export const listSupportRequests = defineQuery({
  input: zodSchema(
    z.object({
      status: z.enum(["open", "resolved"]).optional(),
      audience: z.enum(["customer", "provider"]).optional(),
      ...paging,
    }),
  ),
  output: zodSchema(supportRequestPageReadModel),
  docs: { summary: "Support requests, for administration", tags: ["Admin", "Support"] },
});

export const getSupportRequest = defineQuery({
  input: zodSchema(z.object({ threadId: z.string().min(1) })),
  output: zodSchema(supportRequestSummaryReadModel),
  docs: { summary: "One support request's header", tags: ["Admin", "Support"] },
});

/**
 * Its own field rather than `communicationThreadMessages`: that one gates on
 * `findVisible`, which refuses an administrator — correctly, since they are
 * not a participant. This one gates on the thread being a support thread.
 */
export const listSupportRequestMessages = defineQuery({
  input: zodSchema(z.object({ threadId: z.string().min(1), ...paging })),
  output: zodSchema(messagePageReadModel),
  docs: { summary: "One support request's conversation", tags: ["Admin", "Support"] },
});

export const countOpenSupportRequests = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(z.object({ count: z.number().int().min(0) })),
  docs: { summary: "How many support requests are open", tags: ["Admin", "Support"] },
});

/** Flattens to `supportRequests` / `supportRequest` / `supportRequestMessages` / `supportOpenCount` on the wire. */
export const supportReadSchema = defineGraphQLSchema(
  {
    support: {
      requests: listSupportRequests,
      request: getSupportRequest,
      requestMessages: listSupportRequestMessages,
      openCount: countOpenSupportRequests,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
