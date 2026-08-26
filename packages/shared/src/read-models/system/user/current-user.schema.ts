import { z } from "zod";
import { genderSchema, userRoleSchema } from "../../../enums/user-enums";
import { LOCALES } from "../../../enums/system-enums";

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
  /**
   * Set when the photo is one this person uploaded.
   *
   * `avatarUrl` above is the resolved address of whichever photo wins, so it
   * cannot answer "is this mine, or the one my sign-in provider had?" — and
   * the profile form needs that to know whether to offer "remove".
   */
  avatarKey: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  bio: z.string().nullable(),
  // Derived, not restated — the third copy of this list was the one that
  // drifted out of step with the eight locales the app ships.
  language: z.enum(LOCALES),
  timezone: z.string(),
  // Readable as well as writable. They were added to `updateMe` first, which
  // left the profile page able to save a date of birth and unable to show it.
  dateOfBirth: z.string().nullable(),
  gender: genderSchema.nullable(),
});

export type CurrentUserDTO = z.infer<typeof currentUserReadModel>;
