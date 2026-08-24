/**
 * The inviter's language, for the invitation email.
 *
 * A port of its own rather than reaching into the user context: the language
 * lives on the profile, which belongs to another slice, and this BC only ever
 * needs to *read* one string of it. Anything broader would be an invitation to
 * couple the two.
 *
 * Returns null when there is no profile or no preference, and the template
 * then falls back to English — a wrong language beats a blank email.
 */
export interface InviterLocalePort {
  localeFor(userId: string): Promise<string | null>;
}
