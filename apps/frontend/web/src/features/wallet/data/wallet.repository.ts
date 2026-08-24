import { infiniteQueryOptions } from "@tanstack/react-query";
import type { WalletWithHistoryDTO } from "@ntizo/shared/read-models";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const WALLET = `
  query WalletForProvider($input: WalletForProviderInput!) {
    walletForProvider(input: $input) {
      wallet { currency availableMinor pendingMinor }
      entries {
        id type amountMinor availableDeltaMinor pendingDeltaMinor
        balanceAfterMinor currency description bookingId createdAt
      }
      nextOffset
    }
  }`;

export const WALLET_PAGE_SIZE = 20;

export const walletQueries = {
  forProvider: (providerId: string) =>
    infiniteQueryOptions({
      queryKey: ["wallet", providerId],
      queryFn: ({ pageParam }) =>
        sessionGraphql<{ walletForProvider: WalletWithHistoryDTO }>(WALLET, {
          input: { providerId, limit: WALLET_PAGE_SIZE, offset: pageParam },
        }).then((d) => d.walletForProvider),
      initialPageParam: 0,
      // Null ends it. `hasNextPage` reads `undefined` as "no more", and
      // returning the same offset again would loop forever.
      getNextPageParam: (last) => last.nextOffset ?? undefined,
      // Only when there is a workspace to ask about. Without this the admin
      // detail page fires a wallet query with an empty id while it loads.
      enabled: providerId.length > 0,
    }),
};
