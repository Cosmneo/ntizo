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

/**
 * The address fields, declared once and reused by add and update.
 *
 * Add requires the four a delivery cannot happen without; update makes every
 * one optional. Writing them out twice is how the two drift into disagreeing
 * about which are mandatory.
 */
const addressFields = {
  label: z.string().min(1).max(60),
  country: z.string().length(2),
  city: z.string().min(1).max(120),
  line1: z.string().min(1).max(200),
  district: z.string().max(120).nullable().optional(),
  line2: z.string().max(200).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  // The last hundred metres, in prose. Generous limit: in Mozambique this is
  // often how a provider actually finds the door.
  directions: z.string().max(500).nullable().optional(),
  latitude: z.string().max(32).nullable().optional(),
  longitude: z.string().max(32).nullable().optional(),
  isDefault: z.boolean().optional(),
};

export const addMyAddress = defineMutation({
  input: zodSchema(z.object(addressFields)),
  output: zodSchema(z.object({ id: z.string() })),
  docs: { summary: "Save an address on the authenticated user", tags: ["User"] },
});

export const updateMyAddress = defineMutation({
  input: zodSchema(
    z.object({
      addressId: z.string().uuid(),
      label: addressFields.label.optional(),
      country: addressFields.country.optional(),
      city: addressFields.city.optional(),
      line1: addressFields.line1.optional(),
      district: addressFields.district,
      line2: addressFields.line2,
      postalCode: addressFields.postalCode,
      directions: addressFields.directions,
      latitude: addressFields.latitude,
      longitude: addressFields.longitude,
      isDefault: addressFields.isDefault,
    }),
  ),
  output: zodSchema(okResult),
  docs: { summary: "Update one of the authenticated user's addresses", tags: ["User"] },
});

export const deleteMyAddress = defineMutation({
  input: zodSchema(z.object({ addressId: z.string().uuid() })),
  output: zodSchema(okResult),
  docs: { summary: "Delete one of the authenticated user's addresses", tags: ["User"] },
});

export const userWriteSchema = defineGraphQLSchema(
  {
    user: {
      updateMe: updateMyProfile,
      addAddress: addMyAddress,
      updateAddress: updateMyAddress,
      deleteAddress: deleteMyAddress,
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
