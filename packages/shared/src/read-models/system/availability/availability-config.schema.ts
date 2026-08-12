import { z } from "zod";

/**
 * A provider's whole availability configuration — every member's week and
 * exceptions, plus the workspace's closures and timezone, in one response.
 *
 * Every member comes back at once rather than one per call: the screen's
 * person picker needs the whole list to draw itself, and fetching each
 * member's week on selection would turn switching people into a network
 * round trip for data measured in dozens of rows.
 */
export const availabilityConfigReadModel = z.object({
  providerId: z.string(),
  timezone: z.string(),
  members: z.array(
    z.object({
      memberId: z.string(),
      userId: z.string(),
      name: z.string().nullable(),
      role: z.string(),
      weekly: z.array(
        z.object({
          id: z.string(),
          weekday: z.number(),
          startMinute: z.number(),
          endMinute: z.number(),
        }),
      ),
      exceptions: z.array(
        z.object({
          id: z.string(),
          onDate: z.string(),
          kind: z.enum(["closed", "custom"]),
          startMinute: z.number().nullable(),
          endMinute: z.number().nullable(),
          note: z.string().nullable(),
        }),
      ),
    }),
  ),
  closures: z.array(
    z.object({
      id: z.string(),
      fromDate: z.string(),
      toDate: z.string(),
      note: z.string().nullable(),
    }),
  ),
});

export type AvailabilityConfigDTO = z.infer<typeof availabilityConfigReadModel>;
