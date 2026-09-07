import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptQuote, myQuoteQueries, rejectQuote, requestQuote, withdrawQuote,
  type CloseQuoteInput, type MyQuotesPageInput, type RequestQuoteInput,
} from "@/features/quotes/data/quote.repository";
import type { QuoteCustomerRejectReason } from "@ntizo/shared";

export type {
  CustomerQuoteDTO, CustomerQuoteDetailDTO, CustomerQuotePageDTO,
  QuoteAttachmentDTO, QuoteProposalDTO, RequestQuoteInput,
} from "@/features/quotes/data/quote.repository";

export function useMyQuotes(input: MyQuotesPageInput) {
  return useQuery(myQuoteQueries.page(input));
}

export function useMyQuote(quoteId: string) {
  return useQuery(myQuoteQueries.detail(quoteId));
}

export function useRequestQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestQuoteInput) => requestQuote(input),
    // A new quote changes the "open" count and the first page of it.
    onSettled: () => void qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

/**
 * Reject and withdraw are one hook because they are one decision with two
 * names: the customer is closing an open quote, and which mutation runs
 * depends only on whether a proposal exists yet. Both invalidate the whole
 * `["quotes"]` prefix — the row, the detail and both tab counts all move.
 */
export function useCloseQuote() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["quotes"] });
  return {
    reject: useMutation({
      mutationFn: (v: CloseQuoteInput & { reason: QuoteCustomerRejectReason }) => rejectQuote(v),
      onSettled: invalidate,
    }),
    withdraw: useMutation({
      mutationFn: (v: CloseQuoteInput) => withdrawQuote(v),
      onSettled: invalidate,
    }),
  };
}

/**
 * Acceptance creates a booking, so it invalidates bookings too — the customer
 * lands on the payment page and their bookings list has just grown a row.
 */
export function useAcceptQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Parameters<typeof acceptQuote>[0]) => acceptQuote(v),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["quotes"] });
      void qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
