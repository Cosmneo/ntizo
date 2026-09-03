import { DrizzleContactRequestRepository } from "../infrastructure/repositories/drizzle/contact-request.repository";
import { EmailContactInboxAdapter } from "../infrastructure/outbound-adapters/email-contact-inbox.adapter";
import { SubmitContactRequestCommand } from "../app/use-cases/submit-contact-request.command";
import { ListContactRequestsForAdminQuery } from "../app/use-cases/list-contact-requests-for-admin.query";
import { SetContactRequestStatusCommand } from "../app/use-cases/set-contact-request-status.command";

export function bootstrapContact() {
  const contactRequestRepository = new DrizzleContactRequestRepository();
  const inbox = new EmailContactInboxAdapter();
  return {
    adapters: { contactRequestRepository, inbox },
    useCases: {
      submitContactRequest: new SubmitContactRequestCommand(contactRequestRepository, inbox),
      listContactRequestsForAdmin: new ListContactRequestsForAdminQuery(contactRequestRepository),
      setContactRequestStatus: new SetContactRequestStatusCommand(contactRequestRepository),
    },
  };
}

export type ContactBootstrap = ReturnType<typeof bootstrapContact>;
