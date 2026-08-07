// Read model returned by GET /providers/mine.
// Mirrors flowzao's user-organization.schema location & purpose: a
// viewer-scoped list item (carries the viewer's role, not just the aggregate).

export type ProviderListItemType = "individual" | "organization";
export type ProviderListItemRole = "owner" | "admin" | "staff";

export interface ProviderListItemDTO {
  id: string;
  name: string;
  slug: string;
  type: ProviderListItemType;
  status: string;
  role: ProviderListItemRole;
}
