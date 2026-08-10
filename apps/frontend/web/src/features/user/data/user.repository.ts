import { queryOptions } from "@tanstack/react-query";
import { GraphqlError, sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { CurrentUserDTO } from "../domain/current-user";

// Verified against the live schema (packages/backend read/user/graphql):
// `user: { me: getCurrentUser }` compiles to field `userMe`, taking a
// required-but-empty `JSON!` input — same shape as `provider.mine`, so this
// mirrors provider.repository.ts's MINE document rather than inventing a
// second convention.
const ME = `
  query UserMe($input: JSON!) {
    userMe(input: $input) {
      id email role status createdAt name firstName lastName displayName avatarUrl phoneNumber bio language timezone dateOfBirth gender
    }
  }`;

/**
 * `user.updateMe` — the kit flattens it to `userUpdateMe`, and every field
 * takes a required `input`. Partial by design: a field left out is left
 * alone, and an explicit null clears it.
 */
const UPDATE_ME = `
  mutation UserUpdateMe($input: UserUpdateMeInput!) {
    userUpdateMe(input: $input) {
      ok
    }
  }`;

export interface UpdateMyProfileInput {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  language?: CurrentUserDTO["language"];
  timezone?: string;
  dateOfBirth?: string | null;
  gender?: CurrentUserDTO["gender"];
}

export async function updateMyProfile(input: UpdateMyProfileInput): Promise<void> {
  await sessionGraphql<{ userUpdateMe: { ok: boolean } }>(UPDATE_ME, { input });
}

/** Query definitions. Components consume these via useQuery(userQueries.me()). */
export const userQueries = {
  me: () =>
    queryOptions({
      queryKey: ["user", "me"] as const,
      queryFn: async (): Promise<CurrentUserDTO | null> => {
        try {
          const d = await sessionGraphql<{ userMe: CurrentUserDTO }>(ME, {
            input: {},
          });
          return d.userMe;
        } catch (error) {
          // Resolve to `null` — not throw — ONLY for a genuine "you are not
          // signed in" response. `kitCode` is the kit's coarse
          // classification (see `requireRequesterUserId` in
          // packages/backend/src/modules/ntizo/graphql/context.ts, which
          // throws the kit's `UnauthorizedError`), so this narrows on the
          // classification, not on the fine-grained `code` string, which is
          // free to vary.
          //
          // TanStack Query v5 keeps `data` at its last *successful* value
          // when a refetch's queryFn throws — status flips to "error" but
          // the stale user stays put. Concretely: session expires while the
          // tab is open, refetchOnWindowFocus fires on refocus, the request
          // comes back UNAUTHENTICATED, and without this catch
          // zone-switcher.tsx / both sidebar-user-menu.tsx keep rendering
          // the signed-out user's name and zone links. Resolving `null`
          // instead makes the refetch a *successful* "no user" result,
          // matching the REST fetcher this replaced (which returned `null`
          // on a 401) and what every consumer (`user?.`, `if (!user)`)
          // already expects.
          //
          // Everything else (a database blip, a 500, a network failure)
          // rethrows instead of masquerading as "signed out" — see the
          // whole-branch review: a DB error during an admin's navigation to
          // /admin used to resolve `null` here, `canAccessAdmin(null)` read
          // false, and the admin was silently redirected to `/` with no
          // error surfaced anywhere. Consumers now decide deliberately how
          // to handle a thrown error (see fetchCurrentUser and
          // resolveDestinationForSession).
          if (error instanceof GraphqlError && error.kitCode === "UNAUTHENTICATED") {
            return null;
          }
          throw error;
        }
      },
    }),
};
