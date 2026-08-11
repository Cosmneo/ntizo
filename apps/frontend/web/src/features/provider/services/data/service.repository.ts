import { queryOptions } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { ProviderService } from "../domain/types";

const MINE = `
  query ServiceMine($input: ServiceMineInput!) {
    serviceMine(input: $input) {
      id categoryCode sourceLocale bookingMode status imageUrls
      translations { locale name description }
      options { id pricingMode amountMinor currency durationMinutes minMinutes isDefault isActive }
    }
  }`;

export const serviceQueries = {
  mine: (providerId: string) =>
    queryOptions({
      queryKey: ["provider", "services", providerId],
      queryFn: async (): Promise<ProviderService[]> => {
        const d = await sessionGraphql<{ serviceMine: ProviderService[] }>(MINE, {
          input: { providerId },
        });
        return d.serviceMine;
      },
      // Only once there is a workspace to ask about — without this the page
      // fires a query with an empty providerId while `useActiveProvider` is
      // still loading, the same guard the wallet query uses.
      enabled: providerId.length > 0,
    }),
};
