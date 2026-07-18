/** Paths under _public that must render even for an authenticated user
 * (e.g. accepting an invite requires the invitee's active session). */
export function shouldBypassPublicRedirect(pathname: string): boolean {
  return pathname.startsWith("/accept-invite");
}
