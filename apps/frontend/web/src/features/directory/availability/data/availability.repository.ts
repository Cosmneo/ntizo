import { queryOptions } from "@tanstack/react-query";
import type { ServiceAvailabilityDTO } from "@ntizo/shared/read-models";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";

const FOR_SERVICE = `
  query AvailabilityForService($input: AvailabilityForServiceInput!) {
    availabilityForService(input: $input) {
      serviceId
      timezone
      bookingMode
      pricingMode
      memberIds
      days {
        date
        starts { minuteOfDay startsAt maxMinutes memberIds }
      }
    }
  }`;

export interface ServiceAvailabilityInput {
  serviceId: string;
  /** Omitted asks for the union across every performer; given, one person's own calendar. */
  memberId: string | undefined;
  from: string;
  to: string;
}

/**
 * When one service can be had, over a window of civil dates.
 *
 * The anonymous `/public/graphql` endpoint, same as `directoryQueries` and
 * `providerServicesQueries` — a visitor comparing two barbers has no session
 * yet, and this is the query the provider page's whole calendar panel rests
 * on.
 */
export const serviceAvailabilityQueries = {
  forService: (input: ServiceAvailabilityInput) =>
    queryOptions({
      // `memberId ?? null` rather than the raw `undefined`: react-query's
      // cache key is compared by value, and a key segment that is sometimes
      // absent and sometimes `undefined` is easy to get an inconsistent
      // hook call site for. `null` is a stable, always-present placeholder
      // for "anyone".
      queryKey: [
        "public",
        "service-availability",
        input.serviceId,
        input.memberId ?? null,
        input.from,
        input.to,
      ] as const,
      queryFn: async (): Promise<ServiceAvailabilityDTO> => {
        const d = await publicGraphql<{ availabilityForService: ServiceAvailabilityDTO }>(
          FOR_SERVICE,
          {
            input: {
              serviceId: input.serviceId,
              // `JSON.stringify` drops an `undefined`-valued property
              // entirely, which is exactly what the backend's own
              // `memberId: z.string().min(1).optional()` needs to read
              // "anyone" — sending `null` instead would be a different,
              // unhandled shape.
              memberId: input.memberId,
              from: input.from,
              to: input.to,
            },
          },
        );
        return d.availabilityForService;
      },
    }),
};
