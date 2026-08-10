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
}

export interface ProviderInvite {
  id: string;
  email: string;
  role: ProviderRole;
  token?: string;
  status?: string;
  createdAt?: string;
}

export interface ProviderAddress {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

export interface ProviderDetail {
  id: string;
  name: string;
  slug: string;
  type: ProviderType;
  status: ProviderStatus;
  description?: string;
  address?: ProviderAddress;
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
