import { useInfiniteQuery } from "@tanstack/react-query";
import { walletQueries } from "../data/wallet.repository";

/**
 * A workspace's balance and ledger.
 *
 * One hook for both zones. The provider reads its own and an administrator
 * reads anybody's, but the query is the same and the server decides who may —
 * two hooks would be two places to forget that.
 */
export function useWallet(providerId: string | undefined) {
  return useInfiniteQuery(walletQueries.forProvider(providerId ?? ""));
}
