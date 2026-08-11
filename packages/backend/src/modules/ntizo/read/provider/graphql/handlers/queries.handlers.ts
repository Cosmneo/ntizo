import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type {
  GetProviderDetailProjectionPort,
  ListMyProvidersProjectionPort,
  ListProvidersForAdminPort,
} from "../../app/ports/inbound";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { providerReadSchema } from "../schema/queries";
import { mapGetProviderDetailInput, mapListMyProvidersInput } from "./arg-mappers";

/**
 * The provider READ surface. Members are typed as inbound PORTS, not concrete
 * classes, so the handler stays decoupled from the projection implementations.
 */
export interface ProviderReadModule {
  readonly listMyProviders: ListMyProvidersProjectionPort;
  readonly getProviderDetail: GetProviderDetailProjectionPort;
  readonly listProvidersForAdmin: ListProvidersForAdminPort;
}

/** The page size when the caller does not ask for one. See the projection. */
const DEFAULT_ADMIN_PAGE_SIZE = 25;

export function createProviderReadHandlers(readModule: ProviderReadModule) {
  return graphqlRoutes(providerReadSchema)
    .handleWithUseCase("provider.mine", {
      argsMapper: (_args, ctx) => mapListMyProvidersInput(asNtizoGraphqlContext(ctx)),
      useCase: readModule.listMyProviders,
      responseMapper: (output) => output,
    })
    .handleWithUseCase("provider.byId", {
      argsMapper: (args, ctx) =>
        mapGetProviderDetailInput(args.input, asNtizoGraphqlContext(ctx)),
      useCase: readModule.getProviderDetail,
      responseMapper: (output) => output,
    })
    .handleWithUseCase("provider.allForAdmin", {
      argsMapper: (args, ctx) => {
        // Checked in the mapper, which is the one place that sees both the
        // requester and the input. The route that led here is an affordance;
        // this is the control.
        const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
        // Both, not just the role: the context defaults an anonymous caller to
        // `customer` rather than to null, so a role check alone would be
        // reading a value that was chosen for the absence of a user.
        if (!requesterUserId || role !== "admin") {
          // A typed refusal, not a bare Error. A bare one surfaces as
          // "an unexpected error occurred" with an INTERNAL_ERROR code —
          // which tells the caller nothing and files a denied request in the
          // monitoring as if it were a fault.
          throw new ForbiddenError({
            message: "Only administrators may list every provider",
            code: "ADMIN_ONLY",
          });
        }
        return {
          status: args.input.status,
          search: args.input.search,
          limit: args.input.limit ?? DEFAULT_ADMIN_PAGE_SIZE,
          offset: args.input.offset ?? 0,
        };
      },
      useCase: readModule.listProvidersForAdmin,
      responseMapper: (output) => output,
    })
    .build();
}
