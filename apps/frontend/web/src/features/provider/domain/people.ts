import type { ProviderInvite, ProviderMember, ProviderRole } from "./types";

/**
 * Members and invitations, as one list.
 *
 * They were two tables, and the split was the system's shape rather than the
 * reader's question. Someone opening this page wants to know who is on the team
 * — and an invitation sent yesterday is an answer to that question, just an
 * answer with "waiting" attached. Two tables also meant the same person could
 * appear twice, and neither list could be sorted or searched against the other.
 *
 * Kept out of the component because this is where the interesting decisions
 * are: what counts as one person, what a pending invitation is called, and
 * which end of the list it belongs at.
 */

/** What a row can be. Drives the badge, and what the actions menu may offer. */
export type PersonStatus = "active" | "invited" | "expired";

export interface PersonRow {
  /** Stable across renders; the member id or the invite id. */
  key: string;
  kind: "member" | "invite";
  /** Null for an invitation — nobody has accepted it, so nobody has a name. */
  name: string | null;
  email: string;
  role: ProviderRole;
  status: PersonStatus;
  /** Joined, for a member; sent, for an invitation. ISO, or null if unknown. */
  date: string | null;
}

function inviteStatus(invite: ProviderInvite): PersonStatus {
  // Anything the server does not call pending has already been dealt with —
  // revoked, expired — and reads the same to the person looking at the row:
  // this invitation is not going to turn into a member on its own.
  return (invite.status ?? "pending") === "pending" ? "invited" : "expired";
}

/**
 * One list, members first.
 *
 * Members before invitations because the team is the answer and the
 * invitations are the pending part of it — and because a workspace with one
 * member and twenty stale invitations should still open on its member.
 *
 * An invitation to an address that already belongs to a member is dropped: it
 * has been accepted, and showing both is showing one person twice.
 */
export function toPeopleRows(
  members: readonly ProviderMember[],
  invites: readonly ProviderInvite[],
): PersonRow[] {
  const joined = new Set(members.map((m) => m.email.toLowerCase()));

  const memberRows: PersonRow[] = members.map((m) => ({
    key: m.userId,
    kind: "member",
    name: m.name ?? null,
    email: m.email,
    role: m.role,
    status: "active",
    date: m.joinedAt ?? null,
  }));

  const inviteRows: PersonRow[] = invites
    .filter((i) => !joined.has(i.email.toLowerCase()))
    .map((i) => ({
      key: i.id,
      kind: "invite",
      name: null,
      email: i.email,
      role: i.role,
      status: inviteStatus(i),
      date: i.createdAt ?? null,
    }));

  return [...memberRows, ...inviteRows];
}

export interface PeopleFilters {
  /** Free text against name and email. */
  query: string;
  /** `null` means every role. */
  role: ProviderRole | null;
  /** `null` means every status. */
  status: PersonStatus | null;
}

export const EMPTY_FILTERS: PeopleFilters = {
  query: "",
  role: null,
  status: null,
};

export function hasActiveFilters(filters: PeopleFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.role !== null ||
    filters.status !== null
  );
}

/**
 * Applies the search box and the two pickers.
 *
 * The search folds case and matches name or email, because the two are the
 * only things on the row a person would think to type — and someone looking
 * for a colleague knows one or the other, rarely both.
 */
export function filterPeople(
  rows: readonly PersonRow[],
  filters: PeopleFilters,
): PersonRow[] {
  const needle = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.role && row.role !== filters.role) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (!needle) return true;
    return (
      row.email.toLowerCase().includes(needle) ||
      (row.name?.toLowerCase().includes(needle) ?? false)
    );
  });
}
