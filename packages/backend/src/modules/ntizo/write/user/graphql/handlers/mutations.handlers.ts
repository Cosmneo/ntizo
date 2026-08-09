import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { UpdateMyProfilePort } from "../../../../bounded-contexts/user/app/ports/inbound/update-my-profile.command.port";
import { userWriteSchema } from "../schema/mutations";
import { toExecutionContext } from "./arg-mappers";

export interface UserWriteModule {
  readonly updateMyProfile: UpdateMyProfilePort;
}

export function createUserWriteHandlers(writeModule: UserWriteModule) {
  return graphqlRoutes(userWriteSchema)
    .handle("user.updateMe", async (args, ctx) => {
      const nctx = asNtizoGraphqlContext(ctx);
      await writeModule.updateMyProfile.execute(toExecutionContext(nctx), args.input);
      return { ok: true as const };
    })
    .build();
}
