import { z } from "zod";

/**
 * A person as the administration list sees them.
 *
 * Deliberately narrow. An admin scanning this list is answering "who is on the
 * platform, what can they do, and is anything wrong with their account" — not
 * reading a profile. Bio, timezone, gender and the rest stay out: every field
 * here is one more piece of someone's personal data on a screen that does not
 * need it to do its job.
 */
export const userAdminReadModel = z.object({
  id: z.string().min(1),
  email: z.string(),
  /** Display name, or null where the person never set one. */
  name: z.string().nullable(),
  /** `customer` | `individual_provider` | `organization_owner` | `admin`. */
  role: z.string(),
  status: z.string(),
  phoneNumber: z.string().nullable(),
  /** How many workspaces they belong to. The reason most rows get looked at. */
  providerCount: z.number().int(),
  /** ISO 8601. */
  createdAt: z.string(),
});

export type UserAdminDTO = z.infer<typeof userAdminReadModel>;
