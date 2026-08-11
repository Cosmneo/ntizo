import { queryOptions } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { AdminProvider, AdminProviderDetail } from "../domain/types";

const ALL = `
  query ProviderAllForAdmin($input: ProviderAllForAdminInput!) {
    providerAllForAdmin(input: $input) {
      id name slug type status description city country
      commissionBps ownerEmail createdAt
    }
  }`;

const DETAIL = `
  query ProviderDetailForAdmin($input: ProviderDetailForAdminInput!) {
    providerDetailForAdmin(input: $input) {
      id name slug type status description city country
      commissionBps ownerUserId ownerName ownerEmail ownerPhone
      memberCount logoUrl allowedTransitions createdAt updatedAt
    }
  }`;

const DECIDE = `
  mutation ProviderAdminDecideStatus($input: ProviderAdminDecideStatusInput!) {
    providerAdminDecideStatus(input: $input) { providerId }
  }`;

const SET_COMMISSION = `
  mutation ProviderAdminSetCommission($input: ProviderAdminSetCommissionInput!) {
    providerAdminSetCommission(input: $input) { providerId }
  }`;

export const adminProviderQueries = {
  detail: (providerId: string) =>
    queryOptions({
      queryKey: ["admin", "provider", providerId],
      queryFn: async (): Promise<AdminProviderDetail> => {
        const d = await sessionGraphql<{
          providerDetailForAdmin: AdminProviderDetail;
        }>(DETAIL, { input: { providerId } });
        return d.providerDetailForAdmin;
      },
      // Without this the page fires a query with an empty id on first render,
      // which comes back FORBIDDEN and reads as a permissions problem.
      enabled: providerId.length > 0,
    }),

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

export async function decideProviderStatus(
  providerId: string,
  status: string,
): Promise<void> {
  await sessionGraphql(DECIDE, { input: { providerId, status } });
}

export async function setProviderCommission(
  providerId: string,
  commissionBps: number,
): Promise<void> {
  await sessionGraphql(SET_COMMISSION, { input: { providerId, commissionBps } });
}
