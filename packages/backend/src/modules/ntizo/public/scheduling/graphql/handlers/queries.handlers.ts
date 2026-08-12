import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { schedulingPublicSchema } from "../schema/queries";
import type { ListServiceAvailability } from "../../app/use-cases/list-service-availability.projection";

export interface SchedulingPublicModule {
  readonly listServiceAvailability: ListServiceAvailability;
}

/**
 * No `requireUser` here, unlike the read and write tiers' handlers.
 *
 * That is the whole point of this tier: the projection takes no requester,
 * the mount supplies an empty context, and there is nothing to check. The
 * refusals this field can produce — an unknown or unpublished service, a
 * member who does not perform it, a window wider than two months — all come
 * from the projection itself and are about the *question*, never about who is
 * asking.
 */
export function createSchedulingPublicHandlers(mod: SchedulingPublicModule) {
  return graphqlRoutes(schedulingPublicSchema)
    .handleWithUseCase("availability.forService", {
      argsMapper: (args) => ({
        serviceId: args.input.serviceId,
        memberId: args.input.memberId,
        from: args.input.from,
        to: args.input.to,
      }),
      useCase: mod.listServiceAvailability,
      responseMapper: (output) => output,
    })
    .build();
}
