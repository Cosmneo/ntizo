import { DrizzleScheduleRepository } from "../infrastructure/repositories/drizzle/schedule.repository";
import { DrizzleBookingBusyAdapter } from "../infrastructure/repositories/drizzle/booking-busy.adapter";
import { SetWeeklyPatternCommand } from "../app/use-cases/set-weekly-pattern.command";
import { ManageExceptionsCommand } from "../app/use-cases/manage-exceptions.command";
import { ManageClosuresCommand } from "../app/use-cases/manage-closures.command";
import { ReadAvailabilityConfigQuery } from "../app/use-cases/read-availability-config.query";

export function bootstrapScheduling() {
  const scheduleRepository = new DrizzleScheduleRepository();
  const busyIntervals = new DrizzleBookingBusyAdapter();
  return {
    adapters: { scheduleRepository, busyIntervals },
    useCases: {
      setWeeklyPattern: new SetWeeklyPatternCommand(scheduleRepository),
      manageExceptions: new ManageExceptionsCommand(scheduleRepository),
      manageClosures: new ManageClosuresCommand(scheduleRepository),
      readAvailabilityConfig: new ReadAvailabilityConfigQuery(scheduleRepository),
    },
  };
}

export type SchedulingBootstrap = ReturnType<typeof bootstrapScheduling>;
