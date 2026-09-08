import { queryOptions } from "@tanstack/react-query";
import type {
  CustomerQuoteTab, QuoteAttachmentStep, QuoteCustomerRejectReason, QuoteExpiredCause,
  QuoteStatus, QuoteSupersededCause,
} from "@ntizo/shared";
import { QUOTES_PAGE_SIZE } from "@/features/quotes/domain/status";
import type { AddressInput } from "@/shared/domain/address-input";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

export interface QuoteAttachmentDTO {
  id: string;
  step: QuoteAttachmentStep;
  proposalId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface QuoteProposalDTO {
  id: string;
  priceMinor: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  providerMemberId: string;
  memberFirstName: string;
  note: string | null;
  validUntil: string;
  createdAt: string;
  supersededAt: string | null;
  supersededCause: QuoteSupersededCause | null;
  attachments: QuoteAttachmentDTO[];
}

export interface CustomerQuoteDTO {
  id: string;
  status: QuoteStatus;
  serviceId: string;
  serviceName: string;
  providerId: string;
  timezone: string;
  // Not nullable on the read model: every quote gets a thread, and every
  // proposal gets a validity. The wire types them nullable because the field
  // kit emits every scalar nullable; the zod model is the runtime truth.
  threadId: string;
  expiresAt: string | null;
  expiredCause: QuoteExpiredCause | null;
  closedReason: string | null;
  bookingId: string | null;
  requestedAt: string;
  proposal: QuoteProposalDTO | null;
  providerName: string;
  providerSlug: string;
  providerVerified: boolean;
}

export interface CustomerQuoteDetailDTO extends CustomerQuoteDTO {
  description: string;
  neededBy: string | null;
  address: {
    label: string; line: string; city: string;
    district: string | null; directions: string | null;
  } | null;
  requestAttachments: QuoteAttachmentDTO[];
  proposals: QuoteProposalDTO[];
  closedNote: string | null;
  closingAttachments: QuoteAttachmentDTO[];
}

export interface CustomerQuotePageDTO {
  items: CustomerQuoteDTO[];
  counts: { open: number; history: number };
  hasMore: boolean;
}

/**
 * The selection sets, extracted so a test can assert what is and is not asked
 * for. The wire names are flat — the field kit collapses a nested schema key,
 * so `{ quote: { mine } }` reaches the client as `quoteMine` — and every name
 * below was read off a running server's introspection, not off the read model.
 */
const ATTACHMENT_FIELDS = `id step proposalId fileName contentType sizeBytes`;

export const QUOTE_PROPOSAL_FIELDS = `
  id priceMinor currency startsAt endsAt durationMinutes providerMemberId memberFirstName
  note validUntil createdAt supersededAt supersededCause
  attachments { ${ATTACHMENT_FIELDS} }`;

export const CUSTOMER_QUOTE_FIELDS = `
  id status serviceId serviceName providerId timezone threadId
  expiresAt expiredCause closedReason bookingId requestedAt
  providerName providerSlug providerVerified
  proposal { ${QUOTE_PROPOSAL_FIELDS} }`;

export const CUSTOMER_QUOTE_DETAIL_FIELDS = `
  ${CUSTOMER_QUOTE_FIELDS}
  description neededBy
  address { label line city district directions }
  requestAttachments { ${ATTACHMENT_FIELDS} }
  proposals { ${QUOTE_PROPOSAL_FIELDS} }
  closedNote
  closingAttachments { ${ATTACHMENT_FIELDS} }`;

const PAGE = `
  query QuoteMine($input: QuoteMineInput!) {
    quoteMine(input: $input) {
      items { ${CUSTOMER_QUOTE_FIELDS} }
      counts { open history }
      hasMore
    }
  }`;

const DETAIL = `
  query QuoteById($input: QuoteByIdInput!) {
    quoteById(input: $input) { ${CUSTOMER_QUOTE_DETAIL_FIELDS} }
  }`;

const REQUEST = `
  mutation QuoteRequest($input: QuoteRequestInput!) {
    quoteRequest(input: $input) { quoteId respondBy }
  }`;

const REJECT = `
  mutation QuoteReject($input: QuoteRejectInput!) { quoteReject(input: $input) { quoteId applied } }`;

const WITHDRAW = `
  mutation QuoteWithdraw($input: QuoteWithdrawInput!) { quoteWithdraw(input: $input) { quoteId applied } }`;

const ACCEPT = `
  mutation QuoteAccept($input: QuoteAcceptInput!) { quoteAccept(input: $input) { bookingId payBy } }`;

export interface MyQuotesPageInput { tab: CustomerQuoteTab; offset: number }

export const myQuoteQueries = {
  page: (input: MyQuotesPageInput) =>
    queryOptions({
      queryKey: ["quotes", "mine", input.tab, input.offset] as const,
      queryFn: async (): Promise<CustomerQuotePageDTO> => {
        const d = await sessionGraphql<{ quoteMine: CustomerQuotePageDTO }>(PAGE, {
          input: { tab: input.tab, limit: QUOTES_PAGE_SIZE, offset: input.offset },
        });
        return d.quoteMine;
      },
    }),
  detail: (quoteId: string) =>
    queryOptions({
      queryKey: ["quotes", "mine", "one", quoteId] as const,
      queryFn: async (): Promise<CustomerQuoteDetailDTO | null> => {
        const d = await sessionGraphql<{ quoteById: CustomerQuoteDetailDTO | null }>(DETAIL, {
          input: { quoteId },
        });
        return d.quoteById;
      },
      enabled: quoteId !== "",
    }),
};

export interface RequestQuoteInput {
  serviceId: string;
  description: string;
  locale: string;
  neededBy?: string;
  address?: AddressInput;
  attachments?: { storageKey: string }[];
}

/**
 * Optional fields are spread in only when present rather than sent as `null`.
 * The mutation's zod input marks them `.optional()`, and an explicit `null`
 * for `neededBy` would have to pass the `YYYY-MM-DD` regex to get through.
 */
export async function requestQuote(
  input: RequestQuoteInput,
): Promise<{ quoteId: string; respondBy: string }> {
  const d = await sessionGraphql<{ quoteRequest: { quoteId: string; respondBy: string } }>(REQUEST, {
    input: {
      serviceId: input.serviceId,
      description: input.description,
      locale: input.locale,
      ...(input.neededBy ? { neededBy: input.neededBy } : {}),
      ...(input.address ? { address: input.address } : {}),
      ...(input.attachments && input.attachments.length > 0
        ? { attachments: input.attachments }
        : {}),
    },
  });
  return d.quoteRequest;
}

export interface CloseQuoteInput {
  quoteId: string;
  note?: string;
  attachments?: { storageKey: string }[];
}

/**
 * `applied: false` is the compare-and-swap saying it lost — the quote moved on
 * between the read and the write. It is neither an error nor a success, so it
 * travels as data and the caller decides what to say about it.
 */
export async function rejectQuote(
  input: CloseQuoteInput & { reason: QuoteCustomerRejectReason },
): Promise<{ applied: boolean }> {
  const d = await sessionGraphql<{ quoteReject: { quoteId: string; applied: boolean } }>(REJECT, {
    input: {
      quoteId: input.quoteId,
      reason: input.reason,
      ...(input.note ? { note: input.note } : {}),
      ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    },
  });
  return { applied: d.quoteReject.applied };
}

export async function withdrawQuote(input: CloseQuoteInput): Promise<{ applied: boolean }> {
  const d = await sessionGraphql<{ quoteWithdraw: { quoteId: string; applied: boolean } }>(WITHDRAW, {
    input: {
      quoteId: input.quoteId,
      ...(input.note ? { note: input.note } : {}),
      ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    },
  });
  return { applied: d.quoteWithdraw.applied };
}

export async function acceptQuote(input: {
  quoteId: string;
  address?: AddressInput;
}): Promise<{ bookingId: string; payBy: string }> {
  const d = await sessionGraphql<{ quoteAccept: { bookingId: string; payBy: string } }>(ACCEPT, {
    input: { quoteId: input.quoteId, ...(input.address ? { address: input.address } : {}) },
  });
  return d.quoteAccept;
}
