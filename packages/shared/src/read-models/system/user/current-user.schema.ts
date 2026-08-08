import { z } from "zod";
import { userRoleSchema } from "../../../enums/user-enums";

export const currentUserReadModel = z.object({
  id: z.string().min(1),
  email: z.string(),
  // Shared with the authorization path rather than re-listed here, so a role
  // added to one is never missing from the other.
  role: userRoleSchema,
  status: z.enum(["active", "pending", "suspended"]),
  createdAt: z.string(),
  name: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  bio: z.string().nullable(),
  language: z.enum(["pt-MZ", "pt-PT", "en-US"]),
  timezone: z.string(),
});

export type CurrentUserDTO = z.infer<typeof currentUserReadModel>;
