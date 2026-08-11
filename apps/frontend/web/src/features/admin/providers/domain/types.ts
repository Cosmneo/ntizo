/**
 * A provider as the administration queue sees it.
 *
 * Wider than the member-scoped summary and narrower than the workspace detail:
 * an admin deciding on an application needs what the business claims to be,
 * whose it is, and what it is being charged — and nothing about its bookings,
 * which are not what the decision turns on.
 */
export interface AdminProvider {
  id: string;
  name: string;
  slug: string;
  type: "individual" | "organization";
  status: string;
  description: string | null;
  city: string | null;
  country: string | null;
  /** Customer-side fee in basis points. The one number editable from here. */
  commissionBps: number;
  ownerEmail: string | null;
  createdAt: string;
}

/** 1250 → "12,5%". Basis points are exact; percentages are for reading. */
export function formatCommission(bps: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(bps / 10_000);
}

/**
 * One business, as the administrator deciding about it sees it.
 *
 * `allowedTransitions` comes from the server rather than being derived here:
 * the aggregate owns which moves are legal, and a button the browser offers
 * and the server then refuses is worse than no button.
 */
export interface AdminProviderDocument {
  id: string;
  type: string;
  status: string;
  fileName: string | null;
  contentType: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  /** Set when this upload replaced an earlier one. */
  supersedesId: string | null;
}

export interface AdminProviderMember {
  userId: string;
  email: string | null;
  name: string | null;
  role: string;
  joinedAt: string;
}

export interface AdminProviderInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface AdminProviderDetail {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  description: string | null;
  city: string | null;
  country: string | null;
  commissionBps: number;
  ownerUserId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  memberCount: number;
  members: AdminProviderMember[];
  invites: AdminProviderInvite[];
  logoUrl: string | null;
  photoUrls: string[];
  addressStreet: string | null;
  addressDistrict: string | null;
  addressPostalCode: string | null;
  documents: AdminProviderDocument[];
  reverificationRequestedAt: string | null;
  allowedTransitions: string[];
  createdAt: string;
  updatedAt: string;
}
