import type { CurrentUserDTO } from "@ntizo/shared";
import { canAccessAdmin } from "@/shared/lib/zones";

type MaybeSession = { user?: unknown } | null | undefined;

export function resolveAdminGuard(
  session: MaybeSession,
  me: CurrentUserDTO | null,
  path: string,
):
  | { redirectTo: "/sign-in"; search: { next: string } }
  | { redirectTo: "/" }
  | null {
  if (!session || !session.user) return { redirectTo: "/sign-in", search: { next: path } };
  if (!canAccessAdmin(me)) return { redirectTo: "/" };
  return null;
}
