import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { UpdateMyProfilePort } from "../../../../bounded-contexts/user/app/ports/inbound/update-my-profile.command.port";
import type {
  AddMyAddressPort,
  DeleteMyAddressPort,
  UpdateMyAddressPort,
} from "../../../../bounded-contexts/user/app/ports/inbound/address.command.port";
import { userWriteSchema } from "../schema/mutations";
import { toExecutionContext } from "./arg-mappers";

export interface UserWriteModule {
  readonly updateMyProfile: UpdateMyProfilePort;
  readonly addMyAddress: AddMyAddressPort;
  readonly updateMyAddress: UpdateMyAddressPort;
  readonly deleteMyAddress: DeleteMyAddressPort;
}

export function createUserWriteHandlers(writeModule: UserWriteModule) {
  return graphqlRoutes(userWriteSchema)
    .handle("user.updateMe", async (args, ctx) => {
      const nctx = asNtizoGraphqlContext(ctx);
      await writeModule.updateMyProfile.execute(toExecutionContext(nctx), args.input);
      return { ok: true as const };
    })
    // None of the three take an owner id. The command reads it off the
    // execution context, so there is no field a caller could set to reach
    // somebody else's address.
    .handle("user.addAddress", async (args, ctx) => {
      const nctx = asNtizoGraphqlContext(ctx);
      return writeModule.addMyAddress.execute(toExecutionContext(nctx), args.input);
    })
    .handle("user.updateAddress", async (args, ctx) => {
      const nctx = asNtizoGraphqlContext(ctx);
      await writeModule.updateMyAddress.execute(toExecutionContext(nctx), args.input);
      return { ok: true as const };
    })
    .handle("user.deleteAddress", async (args, ctx) => {
      const nctx = asNtizoGraphqlContext(ctx);
      await writeModule.deleteMyAddress.execute(toExecutionContext(nctx), args.input);
      return { ok: true as const };
    })
    .build();
}
