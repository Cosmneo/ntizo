import type { ProviderListItemDTO } from "@ntizo/shared";

export type ProviderType = "individual" | "organization";
export type ProviderRole = "owner" | "admin" | "staff";
export type ProviderStatus = "active" | "inactive" | "pending" | string;

export type ProviderSummary = ProviderListItemDTO;

export interface ProviderMember {
  userId: string;
  email: string;
  name?: string;
  role: ProviderRole;
  /** ISO. Sent by `providerById` and shown as the row's date. */
  joinedAt?: string;
}

export interface ProviderInvite {
  id: string;
  email: string;
  role: ProviderRole;
  token?: string;
  status?: string;
  createdAt?: string;
}

/**
 * The provider's address, in the backend's own words.
 *
 * It used to say `line1`, `line2` and `region` — a vocabulary the server has
 * never spoken. The aggregate's Address VO carries `street`, `city`,
 * `district`, `country` and `postalCode`, so nothing on either side could be
 * mapped to the other, which is part of why the settings page shipped with its
 * address block greyed out.
 */
export interface ProviderAddress {
  street?: string;
  city?: string;
  district?: string;
  country?: string;
  postalCode?: string;
}

export interface UpdateProviderBody {
  name?: string;
  description?: string;
  address?: ProviderAddress;
  /** Keys only. The read model returns pairs; the write side stores keys. */
  logoKey?: string | null;
  photoKeys?: string[];
  /**
   * Where this business is paid. Both together or neither — the aggregate
   * refuses half of an instruction, because a method with no number fails when
   * the payout runs rather than when it was entered.
   */
  payoutType?: string | null;
  payoutIdentifier?: string | null;
  /**
   * Where this workspace's wall clock runs, an IANA name. Chosen on the
   * availability screen (`features/provider/availability`), which reuses
   * this same `provider.update` mutation rather than adding a second one —
   * the field belongs to the provider aggregate either way.
   */
  timezone?: string;
}

export interface ProviderDocument {
  id: string;
  /** A `ProviderDocumentType`. */
  type: string;
  /** A `ProviderDocumentStatus` — never `superseded`, which the server excludes. */
  status: string;
  fileName: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

/**
 * An invitation as its holder may see it, before signing in.
 *
 * In `domain/` rather than beside the query that fetches it: the accept page
 * renders it, and `ui/` may not reach into `data/`. The shape is the contract
 * between them, so it belongs to neither.
 */
export interface PublicInvite {
  providerName: string;
  inviterName: string;
  role: "admin" | "staff";
  /** Who it was sent to, so the page can spot a mismatched session. */
  email: string;
  status: "pending" | "accepted" | "revoked" | "declined" | "expired";
  expiresAt: string;
}

export interface ProviderImage {
  key: string;
  /** Null locally, where no public base serves the media bucket. */
  url: string | null;
}

export interface ProviderDetail {
  id: string;
  name: string;
  slug: string;
  type: ProviderType;
  status: ProviderStatus;
  description?: string;
  address?: ProviderAddress;
  /** Key plus composed URL. The form shows the URL and saves the key. */
  logo?: ProviderImage | null;
  photos?: ProviderImage[];
  documents?: ProviderDocument[];
  /** Set when an accepted document was replaced. */
  reverificationRequestedAt?: string | null;
  members?: ProviderMember[];
  invites?: ProviderInvite[];
}

export interface CreateProviderBody {
  type: ProviderType;
  name: string;
  slug: string;
  description?: string;
  address?: ProviderAddress;
}

export interface RegisterMeBody {
  name?: string;
  slug?: string;
}

export interface InviteMemberBody {
  email: string;
  role: ProviderRole;
}
