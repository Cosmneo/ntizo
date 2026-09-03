import { z } from "zod";

/**
 * One row of the admin queue. Names carry `.catch("")` like the inbox
 * row's: a requester whose profile was never filled in, or a provider since
 * deleted, degrades to an empty name rather than a refused page.
 */
export const supportRequestSummaryReadModel = z.object({
  threadId: z.string(),
  audience: z.enum(["customer", "provider"]),
  subject: z.string(),
  status: z.enum(["open", "resolved"]),
  requesterUserId: z.string(),
  requesterName: z.string().catch(""),
  providerId: z.string().nullable(),
  providerName: z.string().catch(""),
  bookingId: z.string().nullable(),
  lastMessageAt: z.string(),
  lastMessagePreview: z.string().catch(""),
  unreadForAdmin: z.number().int().min(0),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export const supportRequestPageReadModel = z.object({
  items: z.array(supportRequestSummaryReadModel),
  nextCursor: z.string().nullable(),
});

export type SupportRequestSummaryDTO = z.infer<typeof supportRequestSummaryReadModel>;
export type SupportRequestPageDTO = z.infer<typeof supportRequestPageReadModel>;
