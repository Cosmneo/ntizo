import { NotificationType } from "@ntizo/shared";
import type { TemplateModule } from "./copy";
import { welcomeTemplate } from "./welcome.template";
import { providerWorkspaceWelcomeTemplate } from "./provider-workspace-welcome.template";
import { providerVerifiedTemplate } from "./provider-verified.template";
import { providerDocumentsRequiredTemplate } from "./provider-documents-required.template";
import { teamInvitationTemplate } from "./team-invitation.template";

/**
 * Which types have an email, and which do not.
 *
 * Partial on purpose. Thirty-two types exist and five have producers; writing
 * a template for the other twenty-seven would be writing copy for events
 * nothing raises. A type absent here means "no email", not "an error" — see
 * the renderer.
 */
export const TEMPLATE_REGISTRY: Partial<Record<NotificationType, TemplateModule>> = {
  [NotificationType.Welcome]: welcomeTemplate,
  [NotificationType.ProviderWorkspaceWelcome]: providerWorkspaceWelcomeTemplate,
  [NotificationType.ProviderVerified]: providerVerifiedTemplate,
  [NotificationType.ProviderDocumentsRequired]: providerDocumentsRequiredTemplate,
  [NotificationType.TeamInvitation]: teamInvitationTemplate,
};
