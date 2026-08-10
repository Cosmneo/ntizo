import { z } from "zod";
import { defineQuery, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { providerInvitePublicReadModel } from "@ntizo/shared/read-models";

/**
 * PUBLIC, and deliberately so.
 *
 * The token is the credential: it was mailed to one address and to nobody
 * else. Requiring a session first would mean asking someone to create an
 * account before telling them what they would be joining — which is a leap of
 * faith, and the reason people abandon invitations.
 *
 * Nothing is returned that the invitation email did not already contain.
 */
export const readInvite = defineQuery({
  input: zodSchema(z.object({ token: z.string().trim().min(1).max(200) })),
  output: zodSchema(providerInvitePublicReadModel.nullable()),
  docs: { summary: "What an invitation is for", tags: ["Public"] },
});

export const invitePublicSchema = defineGraphQLSchema({ invite: { read: readInvite } });
