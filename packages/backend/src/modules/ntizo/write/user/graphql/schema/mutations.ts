import { z } from "zod";
import { LOCALES, genderSchema } from "@ntizo/shared";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

const okResult = z.object({ ok: z.literal(true) });

/**
 * WRITE-side GraphQL schema for the user BC. Mutations ONLY — the
 * write=mutations-only fitness gate asserts this.
 *
 * There is deliberately no `userId` field. The subject is always the caller,
 * taken from the session; accepting a target id here would put the whole
 * "can this person edit that profile" question into a mutation that has no
 * legitimate caller needing it.
 *
 * `.nullable()` on the contact fields is load-bearing: null clears the value,
 * an omitted key leaves it alone. Without the distinction there is no way to
 * remove a phone number once it has been set.
 */
export const updateMyProfile = defineMutation({
  input: zodSchema(
    z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      displayName: z.string().min(1).optional(),
      phoneNumber: z.string().nullable().optional(),
      bio: z.string().nullable().optional(),
      avatarUrl: z.string().url().nullable().optional(),
      // Derived from the shared list, not restated. The literal here carried
      // three locales while the web app shipped eight, so a user who picked
      // Deutsch in the header could never save it.
      language: z.enum(LOCALES).optional(),
      timezone: z.string().min(1).optional(),
      // The columns already existed on the profile; only the input was
      // missing them, so nothing here needs a migration.
      dateOfBirth: z.string().date().nullable().optional(),
      gender: genderSchema.nullable().optional(),
    }),
  ),
  output: zodSchema(okResult),
  docs: { summary: "Update the authenticated user's own profile", tags: ["User"] },
});

export const userWriteSchema = defineGraphQLSchema(
  { user: { updateMe: updateMyProfile } },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
