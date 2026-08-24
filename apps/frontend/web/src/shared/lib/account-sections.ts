/**
 * The account area: the person, not any workspace they belong to.
 *
 * It lives in the customer zone alone. The provider zone manages an
 * organization and the admin zone manages the platform; neither is a place to
 * change your own password, and mounting these pages there would give every
 * one of them two homes.
 *
 * In the order they are used rather than alphabetically: the profile first,
 * then the things attached to it, then the settings, then the legal text
 * nobody opens twice.
 *
 * Documents are deliberately absent. Only a provider submits any, and a
 * provider's documents belong to their workspace, not to the person.
 */
export interface AccountSection {
  /** Absolute path, already prefixed for the zone. */
  to: string;
  /** Translation key in the `account` namespace. */
  key: string;
  /** Only the index matches exactly; the rest would swallow their siblings. */
  exact: boolean;
}

const SUFFIXES = [
  { path: "", key: "navProfile", exact: true },
  { path: "/addresses", key: "navAddresses", exact: false },
  { path: "/payment-methods", key: "navPaymentMethods", exact: false },
  { path: "/security", key: "navSecurity", exact: false },
  { path: "/preferences", key: "navPreferences", exact: false },
  { path: "/legal", key: "navLegal", exact: false },
] as const;

export function accountSections(): AccountSection[] {
  return SUFFIXES.map((s) => ({ to: `/account${s.path}`, key: s.key, exact: s.exact }));
}
