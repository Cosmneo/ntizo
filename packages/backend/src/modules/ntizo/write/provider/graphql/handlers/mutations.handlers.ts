import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { ProviderBootstrap } from "../../../../bounded-contexts/provider/bootstrap";
import type { ProviderWorkflowsBootstrap } from "../../../../orchestrations/workflows/provider/bootstrap";
import { providerWriteSchema } from "../schema/mutations";
import { toExecutionContext } from "./arg-mappers";

export interface ProviderWriteModule {
  readonly provider: ProviderBootstrap;
  readonly workflows: ProviderWorkflowsBootstrap;
}

export function createProviderWriteHandlers(mod: ProviderWriteModule) {
  const uc = mod.provider.useCases;

  return graphqlRoutes(providerWriteSchema)
    .handle("provider.create", async (args, ctx) =>
      uc.createProvider.execute(toExecutionContext(asNtizoGraphqlContext(ctx)), args.input),
    )
    .handle("provider.update", async (args, ctx) => {
      await uc.updateProvider.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      );
      return { ok: true as const };
    })
    .handle("provider.deactivate", async (args, ctx) => {
      await uc.deactivateProvider.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      );
      return { ok: true as const };
    })
    .handle("provider.registerMe", async (args, ctx) =>
      mod.workflows.useCases.registerUserAsProvider.execute({
        executionContext: toExecutionContext(asNtizoGraphqlContext(ctx)),
        input: { name: args.input.name, slug: args.input.slug },
      }),
    )
    .handle("provider.invites.send", async (args, ctx) =>
      uc.inviteProviderMember.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      ),
    )
    .handle("provider.invites.accept", async (args, ctx) =>
      uc.acceptProviderInvite.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      ),
    )
    .handle("provider.invites.revoke", async (args, ctx) => {
      await uc.revokeProviderInvite.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      );
      return { ok: true as const };
    })
    .handle("provider.members.remove", async (args, ctx) => {
      await uc.removeProviderMember.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      );
      return { ok: true as const };
    })
    .handle("provider.members.updateRole", async (args, ctx) => {
      await uc.updateProviderMemberRole.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      );
      return { ok: true as const };
    })
    .build();
}
