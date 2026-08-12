import { useQuery } from "@tanstack/react-query";
import {
  serviceAvailabilityQueries,
  type ServiceAvailabilityInput,
} from "@/features/directory/availability/data/availability.repository";

/**
 * When a service can be had, over the seven-day window the panel is
 * currently showing.
 *
 * The only query this whole feature makes — see
 * `service-availability.schema.ts`'s own doc comment for why `bookingMode`
 * rides along on the same response instead of needing a second query to
 * tell "this is a quote service" apart from "this priced service's window
 * is entirely closed".
 */
export function useServiceAvailability(input: ServiceAvailabilityInput) {
  return useQuery(serviceAvailabilityQueries.forService(input));
}
