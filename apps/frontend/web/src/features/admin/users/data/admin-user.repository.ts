import { queryOptions } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { AdminUser } from "../domain/types";

const ALL = `
  query UserAllForAdmin($input: UserAllForAdminInput!) {
    userAllForAdmin(input: $input) {
      id email name role status phoneNumber providerCount createdAt
    }
  }`;

export const adminUserQueries = {
  all: (input: { role?: string; search?: string; limit?: number; offset?: number }) =>
    queryOptions({
      queryKey: ["admin", "users", input],
      queryFn: async (): Promise<AdminUser[]> => {
        const d = await sessionGraphql<{ userAllForAdmin: AdminUser[] }>(ALL, {
          input,
        });
        return d.userAllForAdmin;
      },
    }),
};
