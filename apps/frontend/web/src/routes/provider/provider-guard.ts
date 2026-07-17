type MaybeSession = { user?: unknown } | null | undefined;

export function resolveProviderGuard(session: MaybeSession, path: string):
  | { redirectTo: "/sign-in"; search: { next: string } }
  | null {
  if (session && session.user) return null;
  return { redirectTo: "/sign-in", search: { next: path } };
}
