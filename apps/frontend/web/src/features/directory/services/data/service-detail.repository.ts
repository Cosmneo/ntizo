import { queryOptions } from "@tanstack/react-query";
import type { ServiceDetailDTO } from "@ntizo/shared/read-models";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";

/** Its own exported constant so a test can assert the page's fields are in it. */
export const SERVICE_DETAIL_FIELDS = `
  id providerId providerName providerSlug providerType providerLogoUrl
  providerCity providerDistrict categoryCode categoryName
  name description locationType bookingMode imageUrls isFallback
  options { id name amountMinor currency durationMinutes minMinutes stepMinutes pricingMode isDefault }
  performers { id firstName avatarUrl }`;

const BY_ID = `
  query ServiceById($input: ServiceByIdInput!) {
    serviceById(input: $input) {${SERVICE_DETAIL_FIELDS}
    }
  }`;

export const serviceDetailQueries = {
  byId: (input: { id: string; locale: string }) =>
    queryOptions({
      // The locale is part of the key: the same service in two languages is
      // two different payloads, and sharing a key would serve one under the
      // other's heading.
      queryKey: ["public", "service-detail", input.id, input.locale] as const,
      queryFn: async (): Promise<ServiceDetailDTO | null> => {
        const d = await publicGraphql<{ serviceById: ServiceDetailDTO | null }>(BY_ID, {
          input: { id: input.id, locale: input.locale },
        });
        return d.serviceById;
      },
    }),
};
