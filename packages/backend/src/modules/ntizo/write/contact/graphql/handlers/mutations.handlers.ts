import { graphqlRoutes, type GraphQLHandlerContext } from "@cosmneo/onion-lasagna/graphql/server";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { asNtizoGraphqlContext } from "../../../../graphql/context";
import type { ContactBootstrap } from "../../../../bounded-contexts/contact/bootstrap";
import { contactWriteSchema } from "../schema/mutations";

export interface ContactWriteModule {
  readonly contact: ContactBootstrap;
}

/** Copied rather than shared, as the review handlers' own is — tiers do not import each other here. */
function requireAdmin(ctx: GraphQLHandlerContext): string {
  const { requesterUserId, role } = asNtizoGraphqlContext(ctx);
  if (!requesterUserId || role !== "admin") {
    throw new ForbiddenError({ message: "Only administrators may work the contact queue", code: "ADMIN_ONLY" });
  }
  return requesterUserId;
}

export function createContactWriteHandlers(mod: ContactWriteModule) {
  const uc = mod.contact.useCases;

  return graphqlRoutes(contactWriteSchema)
    .handle("contactRequest.submit", async (args, ctx) => {
      const { website, ...form } = args.input;
      // The trap sprung. A success the script cannot tell from a real one,
      // and no row, no email, no count against the address.
      if (website && website.trim() !== "") {
        return { requestId: crypto.randomUUID(), reference: crypto.randomUUID().slice(0, 6).toUpperCase() };
      }
      const { requesterUserId, ipAddress, userAgent } = asNtizoGraphqlContext(ctx);
      return uc.submitContactRequest.execute({ ...form, requesterUserId, ipAddress, userAgent });
    })
    .handle("contactRequest.setStatus", async (args, ctx) => {
      const actorUserId = requireAdmin(ctx);
      return uc.setContactRequestStatus.execute({ ...args.input, actorUserId });
    })
    .build();
}
