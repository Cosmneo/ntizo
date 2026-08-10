/**
 * Where a provider stands with the platform.
 *
 * The single definition. It was written in three places that disagreed — the
 * aggregate's local union had `archived` and no `rejected`, the persistence
 * layer's array had the same gap with a TODO admitting it, and the read model
 * typed the column as a bare string. Those three had no way to notice each
 * other; this one is imported by all of them.
 *
 * Written as an enum rather than left as the bare `text` the column holds,
 * because four screens now depend on the exact spelling: the public directory
 * shows only `Active`, the admin queue lists only `Pending`, the provider's own
 * zone changes what it offers, and the verified badge reads from it. A string
 * literal repeated across four places is three chances to typo it.
 *
 * Deliberately not the same axis as a person's `VerificationStatus`. That one
 * is about identity documents; this is about whether a business may trade.
 */
export enum ProviderStatus {
  /** Registered, not yet reviewed. Cannot be found or booked. */
  Pending = "pending",
  /** Reviewed and trading. The only status the public directory shows. */
  Active = "active",
  /** Reviewed and refused. Distinct from suspended: this one never traded. */
  Rejected = "rejected",
  /** Was trading, stopped by the platform. Reversible, unlike archived. */
  Suspended = "suspended",
  /** Gone. The one terminal status — nothing transitions out of it. */
  Archived = "archived",
}

export const PROVIDER_STATUSES = Object.values(ProviderStatus);

/**
 * Which statuses an admin may move a provider to from where it is.
 *
 * A map rather than "any status to any status", because two of the transitions
 * are meaningless and one is a trap: reinstating a rejected application is not
 * the same decision as un-suspending a business that already traded, and
 * offering both as one button would hide which of the two just happened.
 */
export const PROVIDER_STATUS_TRANSITIONS: Readonly<
  Record<ProviderStatus, readonly ProviderStatus[]>
> = {
  [ProviderStatus.Pending]: [ProviderStatus.Active, ProviderStatus.Rejected],
  [ProviderStatus.Active]: [ProviderStatus.Suspended, ProviderStatus.Archived],
  [ProviderStatus.Rejected]: [ProviderStatus.Active, ProviderStatus.Archived],
  [ProviderStatus.Suspended]: [ProviderStatus.Active, ProviderStatus.Archived],
  // Terminal. Undoing an archive would make "gone" mean "hidden", and the
  // whole point of having both is that one of them is final.
  [ProviderStatus.Archived]: [],
};

export function canTransition(from: ProviderStatus, to: ProviderStatus): boolean {
  return PROVIDER_STATUS_TRANSITIONS[from].includes(to);
}

/** True for a status the public directory is allowed to show. */
export function isPubliclyVisible(status: ProviderStatus): boolean {
  return status === ProviderStatus.Active;
}
