import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { contactRequestKindSchema, contactRequestStatusSchema } from "@ntizo/shared";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Somebody writing to us through a form. **Anonymous callers are allowed** —
 * the first mutation on this tier that is — because a partnership enquiry or
 * a piece of feedback should not need an account.
 *
 * The bounds here refuse obvious nonsense cheaply; the aggregate is where the
 * rules are defined (2–80, 10–2000, email unless feedback, topic per kind).
 *
 * `website` is the honeypot. Visually hidden on the form, filled only by a
 * script that fills every field; the handler answers a filled one with a
 * success it never wrote. It must ACCEPT a value — refusing it would tell the
 * script which field to skip.
 */
export const submitContactRequest = defineMutation({
  input: zodSchema(
    z.object({
      kind: contactRequestKindSchema,
      topic: z.string().trim().min(1).max(40),
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().max(254).nullable(),
      message: z.string().trim().min(1).max(4000),
      locale: z.string().trim().min(2).max(16),
      originPath: z.string().max(400).nullable(),
      website: z.string().max(400).optional(),
    }),
  ),
  output: zodSchema(z.object({ requestId: z.string().min(1), reference: z.string().length(6) })),
  docs: { summary: "Send a message to the team through the contact or feedback form", tags: ["Contact"] },
});

/** An administrator marking a request resolved, or reopening it. */
export const setContactRequestStatus = defineMutation({
  input: zodSchema(
    z.object({
      requestId: z.string().uuid(),
      status: contactRequestStatusSchema,
    }),
  ),
  output: zodSchema(z.object({ status: contactRequestStatusSchema })),
  docs: { summary: "Mark a contact request resolved, or reopen it", tags: ["Contact", "Admin"] },
});

export const contactWriteSchema = defineGraphQLSchema(
  { contactRequest: { submit: submitContactRequest, setStatus: setContactRequestStatus } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
