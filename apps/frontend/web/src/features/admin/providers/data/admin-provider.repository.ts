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
      memberCount logoUrl photoUrls
      addressStreet addressDistrict addressPostalCode
      reverificationRequestedAt allowedTransitions createdAt updatedAt
      documents {
        id type status fileName contentType uploadedAt reviewedAt
        rejectionReason supersedesId
      }
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

/** Where the API serves this document's bytes. Never the bucket key. */
export function documentUrl(documentId: string): string {
  const base = import.meta.env["VITE_API_URL"] ?? "http://localhost:8788";
  return `${base}/api/documents/${documentId}`;
}

export interface ReviewDocumentInput {
  documentId: string;
  accept: boolean;
  rejectionReason?: string;
}

export async function reviewDocument(input: ReviewDocumentInput): Promise<void> {
  const base = import.meta.env["VITE_API_URL"] ?? "http://localhost:8788";
  const res = await fetch(`${base}/api/documents/${input.documentId}/review`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accept: input.accept,
      ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
    }),
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({ error: "REVIEW_FAILED" }))) as {
      error?: string;
    };
    // The server's code as the message, so the screen can translate it. A
    // status number would tell the reviewer nothing about what to do next.
    throw new Error(error ?? "REVIEW_FAILED");
  }
}
