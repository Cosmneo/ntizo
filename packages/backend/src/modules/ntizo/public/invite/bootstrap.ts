import { DrizzleInvitePublicRepository } from "./infra/repositories/drizzle/invite-public.repository";
import { ReadInviteProjection } from "./app/use-cases/read-invite.projection";
import type { InvitePublicModule } from "./graphql/handlers/queries.handlers";

export function bootstrapInvitePublic(): { useCases: InvitePublicModule } {
  return {
    useCases: { readInvite: new ReadInviteProjection(new DrizzleInvitePublicRepository()) },
  };
}
