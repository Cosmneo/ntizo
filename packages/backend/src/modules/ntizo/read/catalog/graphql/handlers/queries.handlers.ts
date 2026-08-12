import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import { catalogReadSchema } from "../schema/queries";
import type { ListCategoriesForAdminProjection } from "../../app/use-cases/list-categories-for-admin.projection";
import type { ListMyServicesProjection } from "../../app/use-cases/list-my-services.projection";
import type { ServiceReadRepositoryPort } from "../../../../bounded-contexts/catalog/app/ports/outbound/service-read.repository.port";

export interface CatalogReadModule {
  readonly listCategoriesForAdmin: ListCategoriesForAdminProjection;
  readonly listMyServices: ListMyServicesProjection;
  /** Only `isProviderMember` is used, to answer "may this person look". */
  readonly serviceRead: ServiceReadRepositoryPort;
}

export function createCatalogReadHandlers(mod: CatalogReadModule) {
  return graphqlRoutes(catalogReadSchema)
    .handleWithUseCase("category.allForAdmin", {
      argsMapper: (args, ctx) => {
        const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
        if (!requesterUserId || role !== "admin") {
          throw new ForbiddenError({
            message: "Only administrators may list every category",
            code: "ADMIN_ONLY",
          });
        }
        return { search: args.input.search };
      },
      useCase: mod.listCategoriesForAdmin,
      responseMapper: (output) => output,
    })
    // `.handle`, not `.handleWithUseCase`: the kit's `argsMapper` is
    // synchronous, and membership is a query. The check therefore lives in
    // the handler body — still the edge, still the one place that sees both
    // the session and the input.
    .handle("service.mine", async (args, ctx) => {
      const { requesterUserId } = asNtizoGraphqlContext(ctx);
      if (!requesterUserId) {
        throw new ForbiddenError({ message: "Sign in", code: "UNAUTHENTICATED" });
      }
      if (!(await mod.serviceRead.isProviderMember(args.input.providerId, requesterUserId))) {
        throw new ForbiddenError({
          message: "This workspace is not one you belong to",
          code: "NOT_PROVIDER_MEMBER",
        });
      }
      return mod.listMyServices.execute(args.input);
    })
    .build();
}
