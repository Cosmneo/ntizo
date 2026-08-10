import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import type { ReadInviteProjection } from "../../app/use-cases/read-invite.projection";
import { invitePublicSchema } from "../schema/queries";

export interface InvitePublicModule {
  readonly readInvite: ReadInviteProjection;
}

export function createInvitePublicHandlers(uc: InvitePublicModule) {
  return graphqlRoutes(invitePublicSchema)
    .handle("invite.read", async (args) => uc.readInvite.execute(args.input))
    .build();
}
