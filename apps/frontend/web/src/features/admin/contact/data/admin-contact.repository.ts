import { queryOptions } from "@tanstack/react-query";
import type { ContactRequestKind, ContactRequestStatus } from "@ntizo/shared";
import type { ContactRequestAdminPageDTO } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const ALL = `
  query ContactRequestAllForAdmin($input: ContactRequestAllForAdminInput!) {
    contactRequestAllForAdmin(input: $input) {
      items {
        id reference kind topic name email message requesterUserId locale
        originPath ipAddress userAgent status resolvedAt createdAt
      }
      total
      openCount
    }
  }`;

const SET_STATUS = `
  mutation ContactRequestSetStatus($input: ContactRequestSetStatusInput!) {
    contactRequestSetStatus(input: $input) { status }
  }`;

export const ADMIN_CONTACT_PAGE_SIZE = 25;

export interface AdminContactSearch {
  offset?: number;
  kind?: ContactRequestKind;
  status?: ContactRequestStatus;
  search?: string;
}

export const adminContactQueries = {
  /** The whole search is the key: "resolved" is a different result set from "open". */
  all: (search: AdminContactSearch) =>
    queryOptions({
      queryKey: ["admin", "contact", search] as const,
      queryFn: async (): Promise<ContactRequestAdminPageDTO> => {
        const d = await sessionGraphql<{ contactRequestAllForAdmin: ContactRequestAdminPageDTO }>(ALL, {
          input: {
            limit: ADMIN_CONTACT_PAGE_SIZE,
            offset: search.offset ?? 0,
            ...(search.kind ? { kind: search.kind } : {}),
            ...(search.status ? { status: search.status } : {}),
            ...(search.search ? { search: search.search } : {}),
          },
        });
        return d.contactRequestAllForAdmin;
      },
    }),
};

export async function setContactRequestStatus(requestId: string, status: ContactRequestStatus): Promise<void> {
  await sessionGraphql(SET_STATUS, { input: { requestId, status } });
}
