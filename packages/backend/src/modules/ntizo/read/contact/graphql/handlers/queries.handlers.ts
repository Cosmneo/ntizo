import { graphqlRoutes } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import { contactReadSchema } from "../schema/queries";
import type { ListContactRequestsForAdminQuery } from "../../../../bounded-contexts/contact/app/use-cases/list-contact-requests-for-admin.query";

export interface ContactReadModule {
  readonly listContactRequestsForAdmin: ListContactRequestsForAdminQuery;
}

export function createContactReadHandlers(mod: ContactReadModule) {
  return graphqlRoutes(contactReadSchema)
    .handleWithUseCase("contactRequest.allForAdmin", {
      argsMapper: (args, ctx) => {
        const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
        if (!requesterUserId || role !== "admin") {
          throw new ForbiddenError({ message: "Only administrators may read the contact queue", code: "ADMIN_ONLY" });
        }
        return args.input;
      },
      useCase: mod.listContactRequestsForAdmin,
      responseMapper: (output) => output,
    })
    .build();
}
