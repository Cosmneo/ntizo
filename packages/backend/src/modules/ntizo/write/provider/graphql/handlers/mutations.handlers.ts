import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { ProviderBootstrap } from "../../../../bounded-contexts/provider/bootstrap";
import type { ProviderWorkflowsBootstrap } from "../../../../orchestrations/workflows/provider/bootstrap";
import type {
  AcceptProviderInviteOutput,
  InviteProviderMemberOutput,
} from "../../../../bounded-contexts/provider/app/ports/inbound/invite";
import { providerWriteSchema } from "../schema/mutations";
import { toExecutionContext } from "./arg-mappers";

export interface ProviderWriteModule {
  readonly provider: ProviderBootstrap;
  readonly workflows: ProviderWorkflowsBootstrap;
}

/**
 * Projects `InviteProviderMemberOutput` (`{ inviteId, token }`) down to
 * exactly the `provider.invites.send` mutation's declared output
 * (`{ inviteId }`). `token` is a live invite secret — the kit's output
 * validation is a pass/fail gate, not a stripping transform (it returns the
 * original object even on success), so the presentation tier must narrow it
 * explicitly rather than trust the schema to do it.
 */
export function mapProviderInviteSendOutput(
  result: InviteProviderMemberOutput,
): { inviteId: string } {
  return { inviteId: result.inviteId };
}

/**
 * Projects `AcceptProviderInviteOutput` (`{ providerId, memberId }`) down to
 * exactly the `provider.invites.accept` mutation's declared output
 * (`{ providerId }`). Same rationale as `mapProviderInviteSendOutput`.
 */
export function mapProviderInviteAcceptOutput(
  result: AcceptProviderInviteOutput,
): { providerId: string } {
  return { providerId: result.providerId };
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
    .handle("provider.invites.send", async (args, ctx) => {
      const result = await uc.inviteProviderMember.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      );
      // Project to exactly the declared output — the use-case's result also
      // carries `token`, the invite secret, which must never cross this
      // boundary. See mapProviderInviteSendOutput.
      return mapProviderInviteSendOutput(result);
    })
    .handle("provider.invites.accept", async (args, ctx) => {
      const result = await uc.acceptProviderInvite.execute(
        toExecutionContext(asNtizoGraphqlContext(ctx)),
        args.input,
      );
      // Project to exactly the declared output — the use-case's result also
      // carries `memberId`, which is not part of this mutation's contract.
      return mapProviderInviteAcceptOutput(result);
    })
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
