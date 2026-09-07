import type { LucideIcon } from "lucide-react";
import { Activity, Briefcase, Eye, EyeOff, Gavel, Send, Star, Store, UserCheck, UserPlus } from "lucide-react";
import type { ActivityType } from "@ntizo/shared";

/**
 * One glyph per kind of thing that gets recorded — the same nine the type
 * picker offers and the badge names, so a row, an option and a label all
 * say the kind the same way.
 */
const ICONS: Record<ActivityType, LucideIcon> = {
  "user.registered": UserPlus,
  "provider.created": Store,
  "provider.status.decided": Gavel,
  "provider.invite.sent": Send,
  "provider.invite.accepted": UserCheck,
  "service.created": Briefcase,
  "service.published": Eye,
  "service.unpublished": EyeOff,
  "review.created": Star,
};

/** The glyph for a wire type. A type this list does not know draws the generic activity mark rather than nothing. */
export function activityIcon(type: string): LucideIcon {
  return ICONS[type as ActivityType] ?? Activity;
}

/**
 * The glyph in the box the category list draws its image in — the same
 * 36×48 rounded rectangle, so the two lists' first columns line up. Not a
 * monogram: an event is not a person, and the actor is named in words on
 * the line under the sentence.
 */
export function ActivityKindIcon({ type }: { type: string }) {
  const Icon = activityIcon(type);
  return (
    <div
      aria-hidden="true"
      className="grid h-9 w-12 shrink-0 place-items-center rounded-[var(--radius-card-sm)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
    >
      <Icon className="h-4 w-4" />
    </div>
  );
}
