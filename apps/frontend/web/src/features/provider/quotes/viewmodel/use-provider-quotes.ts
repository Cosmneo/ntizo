import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProviderQuoteTab } from "@ntizo/shared";
import {
  declineQuote, proposeQuote, providerQuoteQueries,
  type DeclineQuoteInput, type ProposeQuoteInput,
} from "../data/quote.repository";

// The shapes a `ui` file needs, re-exported here rather than reached for
// directly — `ui -> data` is not an edge the layer boundaries allow, and the
// list page and its row need `ProviderQuoteDTO`/`ProviderQuotePageDTO` the
// same way the customer side's `use-my-quotes.ts` re-exports its own.
export type { ProviderQuoteDTO, ProviderQuoteDetailDTO, ProviderQuotePageDTO } from "../data/quote.repository";

export function useProviderQuotes(input: { providerId: string; tab: ProviderQuoteTab; offset: number }) {
  return useQuery(providerQuoteQueries.page(input));
}

export function useProviderQuote(providerId: string, quoteId: string) {
  return useQuery(providerQuoteQueries.detail(providerId, quoteId));
}

/**
 * The sidebar badge. Mirrors `useAwaitingCount` — a `select` down to one
 * number, and 0 rather than undefined while it loads, because a badge that
 * flickers from nothing to 3 reads as an arrival.
 */
export function useQuoteToAnswerCount(providerId: string | undefined) {
  const query = useQuery({
    ...providerQuoteQueries.counts(providerId ?? ""),
    select: (counts) => counts.toAnswer,
  });
  return query.data ?? 0;
}

/**
 * Both writes invalidate the whole `["provider", providerId]` prefix — the
 * list, the detail and the badge all sit under it — and neither writes
 * optimistically. The refetch is the only honest witness of who won the
 * compare-and-swap.
 */
export function useAnswerQuote(providerId: string) {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["provider", providerId] });
  return {
    propose: useMutation({ mutationFn: (v: ProposeQuoteInput) => proposeQuote(v), onSettled: invalidate }),
    decline: useMutation({
      mutationFn: (v: DeclineQuoteInput) => declineQuote(v),
      onSettled: invalidate,
    }),
  };
}
