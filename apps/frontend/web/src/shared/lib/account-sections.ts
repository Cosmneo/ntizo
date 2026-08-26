/**
 * The account area: the person, not any workspace they belong to.
 *
 * It lives in the customer zone alone. The provider zone manages an
 * organization and the admin zone manages the platform; neither is a place to
 * change your own password, and mounting these pages there would give every
 * one of them two homes.
 *
 * In the order they are used rather than alphabetically: the profile first,
 * then the things attached to it, then the settings.
 *
 * Payment methods and the legal text are deliberately absent from this list.
 * Their routes still exist and answer — this removes them from the menu, not
 * from the app — but neither belongs in a short list of things a person
 * changes about themselves: payments are not wired up yet, and the terms are
 * linked from the footer and from the sign-up form, where they are actually
 * read.
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
  // Second, not last. The inbox already rendered inside this shell with no
  // entry pointing at it, so standing on it highlighted nothing and the menu
  // said you were nowhere. It is also the page opened most often, which is
  // the other reason it sits near the top rather than beside the settings.
  { path: "/notifications", key: "navNotifications", exact: false },
  { path: "/addresses", key: "navAddresses", exact: false },
  { path: "/security", key: "navSecurity", exact: false },
  { path: "/preferences", key: "navPreferences", exact: false },
] as const;

export function accountSections(): AccountSection[] {
  return SUFFIXES.map((s) => ({ to: `/account${s.path}`, key: s.key, exact: s.exact }));
}
