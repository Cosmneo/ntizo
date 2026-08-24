import type { LucideIcon } from "lucide-react";
import { BadgeCheck, FileWarning, Mail, Store, UserPlus } from "lucide-react";

/**
 * The icon a type draws with, and the i18n key its sentence lives under.
 *
 * A lookup with an explicit fallback rather than a `switch` over the enum: the
 * backend can raise a type this build has never heard of — a deploy skew, or a
 * type added after this bundle shipped — and a cell that throws on it would take
 * the whole inbox down over one unrecognised row. An unknown type renders as a
 * generic envelope with a generic sentence, which is the honest answer.
 */
const PRESENTATION: Record<string, { icon: LucideIcon; key: string }> = {
  WELCOME: { icon: Mail, key: "welcome" },
  PROVIDER_WORKSPACE_WELCOME: { icon: Store, key: "providerWorkspaceWelcome" },
  PROVIDER_VERIFIED: { icon: BadgeCheck, key: "providerVerified" },
  PROVIDER_DOCUMENTS_REQUIRED: { icon: FileWarning, key: "providerDocumentsRequired" },
  TEAM_INVITATION: { icon: UserPlus, key: "teamInvitation" },
};

const FALLBACK = { icon: Mail, key: "unknown" } as const;

export function presentationFor(type: string): { icon: LucideIcon; key: string } {
  return PRESENTATION[type] ?? FALLBACK;
}
