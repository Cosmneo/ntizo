import { queryOptions } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { AdminProvider } from "../domain/types";

const ALL = `
  query ProviderAllForAdmin($input: ProviderAllForAdminInput!) {
    providerAllForAdmin(input: $input) {
      id name slug type status description city country
      commissionBps ownerEmail createdAt
    }
  }`;

export const adminProviderQueries = {
  all: (input: { status?: string; search?: string; limit?: number; offset?: number }) =>
    queryOptions({
      queryKey: ["admin", "providers", input],
      queryFn: async (): Promise<AdminProvider[]> => {
        const d = await sessionGraphql<{ providerAllForAdmin: AdminProvider[] }>(ALL, {
          input,
        });
        return d.providerAllForAdmin;
      },
    }),
};
