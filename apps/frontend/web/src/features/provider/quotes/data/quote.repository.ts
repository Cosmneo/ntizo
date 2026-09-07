import { queryOptions } from "@tanstack/react-query";
import type {
  ProviderQuoteTab, QuoteAttachmentStep, QuoteExpiredCause, QuoteProviderDeclineReason,
  QuoteStatus, QuoteSupersededCause,
} from "@ntizo/shared";
import { QUOTES_PAGE_SIZE } from "@/features/quotes/domain/status";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

interface QuoteAttachmentDTO {
  id: string;
  step: QuoteAttachmentStep;
  proposalId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

interface QuoteProposalDTO {
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

interface QuotePerformerDTO {
  id: string;
  firstName: string;
}

export interface ProviderQuoteDTO {
  id: string;
  status: QuoteStatus;
  serviceId: string;
  serviceName: string;
  providerId: string;
  timezone: string;
  threadId: string;
  expiresAt: string | null;
  expiredCause: QuoteExpiredCause | null;
  closedReason: string | null;
  bookingId: string | null;
  requestedAt: string;
  proposal: QuoteProposalDTO | null;
  // The reveal rule, enforced by shape: no surname, phone, email or street
  // line — `providerQuoteReadModel` has no field for any of them, so there is
  // nowhere to put what a workspace must not see before a booking is paid.
  // See `to-provider-quote-dto.ts` on the backend for the fuller argument.
  customerFirstName: string;
  addressDistrict: string | null;
  addressCity: string | null;
  neededBy: string | null;
  descriptionSnippet: string;
  attachmentCount: number;
}

export interface ProviderQuoteDetailDTO extends ProviderQuoteDTO {
  description: string;
  customerCompletedBookings: number;
  requestAttachments: QuoteAttachmentDTO[];
  proposals: QuoteProposalDTO[];
  closedNote: string | null;
  closingAttachments: QuoteAttachmentDTO[];
  /** The workspace's own rate, for the "o cliente paga / recebes" split. */
  commissionBps: number;
  /** Members who perform this service — the proposal form's member picker. */
  performers: QuotePerformerDTO[];
}

export interface ProviderQuotePageDTO {
  items: ProviderQuoteDTO[];
  counts: { toAnswer: number; waiting: number; history: number };
  hasMore: boolean;
}

/**
 * The selection sets, extracted so a test can assert what is and is not asked
 * for. Every name below was read off a running server's introspection, the
 * same discipline the customer's `quote.repository.ts` follows — not off the
 * read model source, and not "fixed" against it if the two ever disagree.
 */
const ATTACHMENT_FIELDS = `id step proposalId fileName contentType sizeBytes`;

const PROPOSAL_FIELDS = `
  id priceMinor currency startsAt endsAt durationMinutes providerMemberId memberFirstName
  note validUntil createdAt supersededAt supersededCause
  attachments { ${ATTACHMENT_FIELDS} }`;

export const PROVIDER_QUOTE_FIELDS = `
  id status serviceId serviceName providerId timezone threadId
  expiresAt expiredCause closedReason bookingId requestedAt
  customerFirstName addressDistrict addressCity neededBy descriptionSnippet attachmentCount
  proposal { ${PROPOSAL_FIELDS} }`;

export const PROVIDER_QUOTE_DETAIL_FIELDS = `
  ${PROVIDER_QUOTE_FIELDS}
  description customerCompletedBookings
  requestAttachments { ${ATTACHMENT_FIELDS} }
  proposals { ${PROPOSAL_FIELDS} }
  closedNote
  closingAttachments { ${ATTACHMENT_FIELDS} }
  commissionBps
  performers { id firstName }`;

const PAGE = `
  query QuoteForProvider($input: QuoteForProviderInput!) {
    quoteForProvider(input: $input) {
      items { ${PROVIDER_QUOTE_FIELDS} }
      counts { toAnswer waiting history }
      hasMore
    }
  }`;

const DETAIL = `
  query QuoteByIdForProvider($input: QuoteByIdForProviderInput!) {
    quoteByIdForProvider(input: $input) { ${PROVIDER_QUOTE_DETAIL_FIELDS} }
  }`;

const COUNTS = `
  query QuoteCountsForProvider($input: QuoteCountsForProviderInput!) {
    quoteCountsForProvider(input: $input) { toAnswer }
  }`;

const PROPOSE = `
  mutation QuotePropose($input: QuoteProposeInput!) {
    quotePropose(input: $input) { quoteId validUntil }
  }`;

const DECLINE = `
  mutation QuoteDecline($input: QuoteDeclineInput!) {
    quoteDecline(input: $input) { quoteId applied }
  }`;

export interface ProviderQuotesPageInput {
  providerId: string;
  tab: ProviderQuoteTab;
  offset: number;
}

/**
 * Keys start with the workspace, exactly as the provider's booking queries
 * do — switching providers cannot serve one workspace's rows under
 * another's heading, because the narrowing lives in the key.
 */
export const providerQuoteQueries = {
  page: (input: ProviderQuotesPageInput) =>
    queryOptions({
      queryKey: ["provider", input.providerId, "quotes", input.tab, input.offset] as const,
      queryFn: async (): Promise<ProviderQuotePageDTO> => {
        const d = await sessionGraphql<{ quoteForProvider: ProviderQuotePageDTO }>(PAGE, {
          input: {
            providerId: input.providerId,
            tab: input.tab,
            limit: QUOTES_PAGE_SIZE,
            offset: input.offset,
          },
        });
        return d.quoteForProvider;
      },
      enabled: input.providerId !== "",
    }),
  detail: (providerId: string, quoteId: string) =>
    queryOptions({
      queryKey: ["provider", providerId, "quote", quoteId] as const,
      queryFn: async (): Promise<ProviderQuoteDetailDTO | null> => {
        const d = await sessionGraphql<{ quoteByIdForProvider: ProviderQuoteDetailDTO | null }>(DETAIL, {
          input: { providerId, quoteId },
        });
        return d.quoteByIdForProvider;
      },
      enabled: providerId !== "",
    }),
  /**
   * The sidebar's badge, from its own field rather than a page of the list
   * with `limit: 1` — the shell draws this on every screen and has no page
   * of quotes to hang it off, the same reasoning the counts read documents
   * on the backend.
   */
  counts: (providerId: string) =>
    queryOptions({
      queryKey: ["provider", providerId, "quote-counts"] as const,
      queryFn: async (): Promise<{ toAnswer: number }> => {
        const d = await sessionGraphql<{ quoteCountsForProvider: { toAnswer: number } }>(COUNTS, {
          input: { providerId },
        });
        return d.quoteCountsForProvider;
      },
      enabled: providerId !== "",
    }),
};

export interface ProposeQuoteInput {
  quoteId: string;
  priceMinor: number;
  /** ISO 8601 with an offset. Built from the date and time fields in the provider's own zone. */
  startsAt: string;
  durationMinutes: number;
  providerMemberId: string;
  note?: string;
  attachments?: { storageKey: string }[];
}

/**
 * `validUntil: null` is the compare-and-swap saying it lost — the quote moved
 * on between the read and the write, most often because the customer accepted
 * or withdrew while the form was open. Not an error: the provider did nothing
 * wrong, and the page reloads and says so.
 */
export async function proposeQuote(input: ProposeQuoteInput): Promise<{ validUntil: string | null }> {
  const d = await sessionGraphql<{ quotePropose: { quoteId: string; validUntil: string | null } }>(
    PROPOSE,
    {
      input: {
        quoteId: input.quoteId,
        priceMinor: input.priceMinor,
        startsAt: input.startsAt,
        durationMinutes: input.durationMinutes,
        providerMemberId: input.providerMemberId,
        ...(input.note ? { note: input.note } : {}),
        ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
      },
    },
  );
  return { validUntil: d.quotePropose.validUntil };
}

export interface DeclineQuoteInput {
  quoteId: string;
  reason: QuoteProviderDeclineReason;
  note?: string;
  attachments?: { storageKey: string }[];
}

/**
 * The provider's no, from either open state — a request they will not price,
 * or a proposal they are taking back. `applied: false` is the same
 * compare-and-swap loss `rejectQuote` reports on the customer's side: neither
 * an error nor a success, so it travels as data and the caller decides what
 * to say about it.
 */
export async function declineQuote(input: DeclineQuoteInput): Promise<{ applied: boolean }> {
  const d = await sessionGraphql<{ quoteDecline: { quoteId: string; applied: boolean } }>(DECLINE, {
    input: {
      quoteId: input.quoteId,
      reason: input.reason,
      ...(input.note ? { note: input.note } : {}),
      ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    },
  });
  return { applied: d.quoteDecline.applied };
}
