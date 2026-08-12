import { DrizzleScheduleRepository } from "../../bounded-contexts/scheduling/infrastructure/repositories/drizzle/schedule.repository";
import { NoBookingsBusyAdapter } from "../../bounded-contexts/scheduling/infrastructure/repositories/drizzle/no-bookings-busy.adapter";
import { ListServiceAvailability } from "./app/use-cases/list-service-availability.projection";
import type { SchedulingPublicModule } from "./graphql/handlers/queries.handlers";

/**
 * The same two adapters the bounded context's own bootstrap builds.
 *
 * Built here rather than reached for through `bootstrapScheduling()` because
 * that bootstrap also constructs the four session-authed use cases, and this
 * tier has no business owning them. Both are stateless — repositories resolve
 * `getDb()` per call — so a second instance costs nothing and keeps the public
 * mount's dependency list to exactly what it uses.
 *
 * `NoBookingsBusyAdapter` returns an empty map until slice 4 ships bookings.
 * When it does, this line is the only thing that changes here.
 */
export function bootstrapSchedulingPublic(): {
  adapters: {
    scheduleRepository: DrizzleScheduleRepository;
    busyIntervals: NoBookingsBusyAdapter;
  };
  useCases: SchedulingPublicModule;
} {
  const scheduleRepository = new DrizzleScheduleRepository();
  const busyIntervals = new NoBookingsBusyAdapter();
  return {
    adapters: { scheduleRepository, busyIntervals },
    useCases: {
      listServiceAvailability: new ListServiceAvailability(scheduleRepository, busyIntervals),
    },
  };
}

export type SchedulingPublicBootstrap = ReturnType<typeof bootstrapSchedulingPublic>;
