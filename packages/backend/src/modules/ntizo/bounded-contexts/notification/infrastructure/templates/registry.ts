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
import { quoteReceivedTemplate } from "./quote-received.template";
import { quoteAcceptedTemplate } from "./quote-accepted.template";
import { quoteDeclinedTemplate } from "./quote-declined.template";
import { quoteExpiredTemplate } from "./quote-expired.template";
import { providerQuoteRequestedTemplate } from "./provider-quote-requested.template";
import { providerQuoteAcceptedTemplate } from "./provider-quote-accepted.template";
import { providerQuoteSlotTakenTemplate } from "./provider-quote-slot-taken.template";

/**
 * Which types have an email, and which do not.
 *
 * Partial on purpose. `Object.values(NotificationType).length` is fifty and
 * twenty have producers; writing a template for the rest would be writing
 * copy for events nothing raises. (Counted by running it, not by re-reading
 * the enum by eye.) A type absent here means "no email", not "an error" —
 * see the renderer. `BookingConfirmed`, `ProviderBookingConfirmed` and
 * `ProviderBookingCancelledByCustomer` are deliberately absent: in-app only
 * for this phase, no one outside the app needs to be pulled back in for
 * them. Of the ten quote types, `ProviderQuoteDeclined`,
 * `ProviderQuoteWithdrawn` and `ProviderQuoteExpired` are deliberately
 * absent for the same reason — none of the three needs to pull a provider
 * back in at night.
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
  [NotificationType.QuoteReceived]: quoteReceivedTemplate,
  [NotificationType.QuoteAccepted]: quoteAcceptedTemplate,
  [NotificationType.QuoteDeclined]: quoteDeclinedTemplate,
  [NotificationType.QuoteExpired]: quoteExpiredTemplate,
  [NotificationType.ProviderQuoteRequested]: providerQuoteRequestedTemplate,
  [NotificationType.ProviderQuoteAccepted]: providerQuoteAcceptedTemplate,
  [NotificationType.ProviderQuoteSlotTaken]: providerQuoteSlotTakenTemplate,
};
