import type { AvailabilityConfigDTO } from "@ntizo/shared";

/**
 * The whole shape `availability.config` returns, unchanged.
 *
 * Re-exported rather than redeclared — the same precedent
 * `features/user/domain/current-user.ts` and `features/provider/domain/types.ts`
 * (`ProviderSummary = ProviderListItemDTO`) already set: one definition, in
 * the read model itself, so this feature's own type can never drift from
 * what the server actually sends.
 */
export type AvailabilityConfig = AvailabilityConfigDTO;
export type AvailabilityMember = AvailabilityConfigDTO["members"][number];
export type WeeklyRule = AvailabilityMember["weekly"][number];
export type AvailabilityException = AvailabilityMember["exceptions"][number];
export type ExceptionKind = AvailabilityException["kind"];
export type HouseClosure = AvailabilityConfigDTO["closures"][number];

/**
 * A weekly rule as the form edits it — weekday, start and end minute, and
 * nothing else.
 *
 * Deliberately id-less: `availability.setWeeklyPattern` replaces a member's
 * entire week in one call rather than adding or removing rows by id, so a
 * draft row never needs a server identity to be savable, and `overlaps()`
 * below works the same on a row that has been saved and one that has not.
 */
export interface WeeklyRuleDraft {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/** True for the one-member case: an individual provider, not an organization with staff. */
export function isIndividualProvider(config: Pick<AvailabilityConfig, "members">): boolean {
  return config.members.length <= 1;
}

/** Owners and admins run the whole workspace's calendar; staff only their own. */
export function canManageWorkspace(role: string | undefined): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Whether the signed-in caller may edit a given member's week and exceptions.
 *
 * The server enforces this too (`NOT_SELF_OR_PROVIDER_OWNER_OR_ADMIN`) — this
 * only decides whether to offer the controls, the same split every other
 * role check in this app follows (see `ServicesPage`'s `canPublish`,
 * `MembersPage`'s `canManage`). Reads the *live* role and the *live* current
 * user id, not whatever the screen happened to open with, so switching the
 * selected person never leaves a stale answer in place.
 */
export function canEditMember(
  member: Pick<AvailabilityMember, "userId">,
  opts: { role: string | undefined; currentUserId: string | null | undefined },
): boolean {
  if (canManageWorkspace(opts.role)) return true;
  return opts.currentUserId != null && member.userId === opts.currentUserId;
}

/** The server's code, not its English sentence — the message belongs in the reader's language. */
export function availabilityErrorMessage(
  e: unknown,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const code = (e as { code?: string } | undefined)?.code ?? (e as Error | undefined)?.message;
  return t(`availabilityError.${code}`, { defaultValue: t("availabilityErrorGeneric") });
}
