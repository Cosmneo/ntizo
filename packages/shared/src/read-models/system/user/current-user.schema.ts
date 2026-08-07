import { z } from "zod";

export const currentUserReadModel = z.object({
  id: z.string().min(1),
  email: z.string(),
  role: z.enum(["customer", "individual_provider", "organization_owner", "admin"]),
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
