import { DrizzleContactRequestRepository } from "../../../bounded-contexts/contact/infrastructure/repositories/drizzle/contact-request.repository";
import { ListContactRequestsForAdminQuery } from "../../../bounded-contexts/contact/app/use-cases/list-contact-requests-for-admin.query";
import type { ContactReadModule } from "../graphql/handlers/queries.handlers";

/** Its own adapter rather than `bootstrapContact()`'s — a read mount owns no inbox. */
export function bootstrapContactRead(): {
  adapters: { contactRequestRepository: DrizzleContactRequestRepository };
  useCases: ContactReadModule;
} {
  const contactRequestRepository = new DrizzleContactRequestRepository();
  return {
    adapters: { contactRequestRepository },
    useCases: { listContactRequestsForAdmin: new ListContactRequestsForAdminQuery(contactRequestRepository) },
  };
}

export type ContactReadBootstrap = ReturnType<typeof bootstrapContactRead>;
