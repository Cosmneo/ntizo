import { z } from "zod";

/**
 * How many providers stand in each status, all five named, zero when none:
 * a tile has to render a zero, and a GraphQL object cannot carry a map.
 * `pending` is the administrator's queue; the rest are the platform's shape.
 */
export const providerStatusCountsReadModel = z.object({
  pending: z.number().int().min(0),
  active: z.number().int().min(0),
  rejected: z.number().int().min(0),
  suspended: z.number().int().min(0),
  archived: z.number().int().min(0),
});

export type ProviderStatusCountsDTO = z.infer<typeof providerStatusCountsReadModel>;
