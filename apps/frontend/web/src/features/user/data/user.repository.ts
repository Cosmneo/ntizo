import { queryOptions } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { CurrentUserDTO } from "../domain/current-user";

// Verified against the live schema (packages/backend read/user/graphql):
// `user: { me: getCurrentUser }` compiles to field `userMe`, taking a
// required-but-empty `JSON!` input — same shape as `provider.mine`, so this
// mirrors provider.repository.ts's MINE document rather than inventing a
// second convention.
const ME = `
  query UserMe($input: JSON!) {
    userMe(input: $input) {
      id email role status createdAt name firstName lastName displayName avatarUrl phoneNumber bio language timezone
    }
  }`;

/** Query definitions. Components consume these via useQuery(userQueries.me()). */
export const userQueries = {
  me: () =>
    queryOptions({
      queryKey: ["user", "me"] as const,
      queryFn: async () => {
        const d = await sessionGraphql<{ userMe: CurrentUserDTO }>(ME, {
          input: {},
        });
        return d.userMe;
      },
    }),
};
