import { NotificationType } from "@ntizo/shared";
import type { TemplateModule } from "./copy";
import { welcomeTemplate } from "./welcome.template";
import { providerWorkspaceWelcomeTemplate } from "./provider-workspace-welcome.template";
import { providerVerifiedTemplate } from "./provider-verified.template";
import { providerDocumentsRequiredTemplate } from "./provider-documents-required.template";
import { teamInvitationTemplate } from "./team-invitation.template";
import { newMessageTemplate } from "./new-message.template";
import { supportRequestOpenedTemplate } from "./support-request-opened.template";
import { supportRequestMessageTemplate } from "./support-request-message.template";
import { supportReplyTemplate } from "./support-reply.template";
import { supportRequestResolvedTemplate } from "./support-request-resolved.template";
import { providerBookingReceivedTemplate } from "./provider-booking-received.template";
import { bookingAcceptedTemplate } from "./booking-accepted.template";
import { bookingDeclinedTemplate } from "./booking-declined.template";

/**
 * Which types have an email, and which do not.
 *
 * Partial on purpose. `Object.values(NotificationType).length` is
 * thirty-nine and thirteen have producers; writing a template for the other
 * twenty-six would be writing copy for events nothing raises. (Counted by
 * running it, not by re-reading the enum by eye — the two greps this file's
 * count was previously checked with gave 35 and 31.) A type absent here
 * means "no email", not "an error" — see the renderer. `BookingConfirmed`,
 * `ProviderBookingConfirmed` and `ProviderBookingCancelledByCustomer` are
 * deliberately absent: in-app only for this phase, no one outside the app
 * needs to be pulled back in for them.
 */
export const TEMPLATE_REGISTRY: Partial<Record<NotificationType, TemplateModule>> = {
  [NotificationType.Welcome]: welcomeTemplate,
  [NotificationType.ProviderWorkspaceWelcome]: providerWorkspaceWelcomeTemplate,
  [NotificationType.ProviderVerified]: providerVerifiedTemplate,
  [NotificationType.ProviderDocumentsRequired]: providerDocumentsRequiredTemplate,
  [NotificationType.TeamInvitation]: teamInvitationTemplate,
  [NotificationType.NewMessage]: newMessageTemplate,
  [NotificationType.SupportRequestOpened]: supportRequestOpenedTemplate,
  [NotificationType.SupportRequestMessage]: supportRequestMessageTemplate,
  [NotificationType.SupportReply]: supportReplyTemplate,
  [NotificationType.SupportRequestResolved]: supportRequestResolvedTemplate,
  [NotificationType.ProviderBookingReceived]: providerBookingReceivedTemplate,
  [NotificationType.BookingAccepted]: bookingAcceptedTemplate,
  [NotificationType.BookingDeclined]: bookingDeclinedTemplate,
};
