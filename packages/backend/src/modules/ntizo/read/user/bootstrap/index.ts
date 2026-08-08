import { DrizzleUserReadRepository } from "../infra/repositories/drizzle/user-read.repository";
import { GetCurrentUserProjection } from "../app/use-cases/get-current-user.projection";
import type { UserReadModule } from "../graphql/handlers/queries.handlers";

export function bootstrapUserRead(): {
  adapters: { userReadRepository: DrizzleUserReadRepository };
  useCases: UserReadModule;
} {
  const userReadRepository = new DrizzleUserReadRepository();
  return {
    adapters: { userReadRepository },
    useCases: { getCurrentUser: new GetCurrentUserProjection(userReadRepository) },
  };
}

export type UserReadBootstrap = ReturnType<typeof bootstrapUserRead>;
