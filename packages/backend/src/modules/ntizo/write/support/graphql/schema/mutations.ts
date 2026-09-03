import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/** The platform answering. Same body and attachment bounds as `communication.send`. */
export const reply = defineMutation({
  input: zodSchema(
    z.object({
      threadId: z.string().min(1),
      body: z.string().trim().max(4000),
      attachments: z.array(z.object({ storageKey: z.string().min(1) })).max(5).optional(),
    }),
  ),
  output: zodSchema(z.object({ id: z.string().min(1) })),
  docs: { summary: "Reply to a support request as the platform", tags: ["Admin", "Support"] },
});

export const resolve = defineMutation({
  input: zodSchema(z.object({ threadId: z.string().min(1) })),
  output: zodSchema(z.object({ threadId: z.string().min(1), status: z.literal("resolved") })),
  docs: { summary: "Mark a support request resolved", tags: ["Admin", "Support"] },
});

export const markRead = defineMutation({
  input: zodSchema(z.object({ threadId: z.string().min(1) })),
  output: zodSchema(z.object({ marked: z.number().int() })),
  docs: { summary: "Mark a support request's messages read for the platform", tags: ["Admin", "Support"] },
});

/** Flattens to `supportReply` / `supportResolve` / `supportMarkRead` on the wire. */
export const supportWriteSchema = defineGraphQLSchema(
  { support: { reply, resolve, markRead } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
