import { z } from "zod";
import { contactRequestKindSchema, contactRequestStatusSchema } from "../../../enums/contact-enums";

/**
 * One request as the administration queue sees it.
 *
 * What the queue shows, including the address it was sent from: unlike the
 * review projection, this screen is the investigation — it is where somebody
 * decides whether a message is a customer in trouble or a script.
 * `resolvedByUserId` is left out; nothing displays it.
 */
export const contactRequestAdminReadModel = z.object({
  id: z.string().min(1),
  /** The six characters the person was shown. */
  reference: z.string().length(6),
  kind: contactRequestKindSchema,
  topic: z.string().min(1),
  name: z.string(),
  email: z.string().nullable(),
  message: z.string(),
  requesterUserId: z.string().nullable(),
  locale: z.string(),
  originPath: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  status: contactRequestStatusSchema,
  /** ISO 8601, or null while open. */
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type ContactRequestAdminDTO = z.infer<typeof contactRequestAdminReadModel>;

export const contactRequestAdminPageReadModel = z.object({
  items: z.array(contactRequestAdminReadModel),
  total: z.number().int().min(0),
  /** Open across the whole table, whatever the filters — the queue's badge. */
  openCount: z.number().int().min(0),
});

export type ContactRequestAdminPageDTO = z.infer<typeof contactRequestAdminPageReadModel>;
