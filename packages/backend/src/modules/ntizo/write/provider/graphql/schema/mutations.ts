import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

const providerIdResult = z.object({ providerId: z.string().min(1) });
const okResult = z.object({ ok: z.literal(true) });

/**
 * Where the business is.
 *
 * Optional as a whole and optional field by field. The aggregate has always
 * accepted an address; only this schema did not declare one, so the onboarding
 * wizard had nowhere to send what it collected. Every part stays optional
 * because a provider who works only at the customer's home has no premises to
 * describe, and refusing to create them over a missing street would be refusing
 * a legitimate business.
 */
const addressInput = z.object({
  country: z.string().trim().length(2).optional(),
  city: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  street: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().max(20).optional(),
});

export const createProvider = defineMutation({
  input: zodSchema(
    z.object({
      type: z.enum(["individual", "organization"]),
      name: z.string().min(1),
      slug: z.string().min(1),
      description: z.string().optional(),
      address: addressInput.optional(),
    }),
  ),
  output: zodSchema(providerIdResult),
  docs: { summary: "Create a provider owned by the caller", tags: ["Provider"] },
});

export const updateProvider = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      // Keys, not URLs — the upload route hands back a key and the reader
      // composes the URL from the public base, so a bucket or CDN move does
      // not rewrite every row.
      logoKey: z.string().max(300).optional(),
      photoKeys: z.array(z.string().max(300)).max(24).optional(),
      // The command has always accepted an address; only this schema did not
      // declare one, which is why the settings page shipped with its address
      // block greyed out under "temporarily unavailable". It was not
      // temporary — nothing was going to change it but this line.
      address: addressInput.optional(),
    }),
  ),
  output: zodSchema(okResult),
  docs: { summary: "Update a provider's details", tags: ["Provider"] },
});

export const deactivateProvider = defineMutation({
  input: zodSchema(z.object({ providerId: z.string().min(1) })),
  output: zodSchema(okResult),
  docs: { summary: "Deactivate a provider", tags: ["Provider"] },
});

export const registerMeAsProvider = defineMutation({
  input: zodSchema(
    z.object({ name: z.string().optional(), slug: z.string().optional() }),
  ),
  output: zodSchema(providerIdResult),
  docs: {
    summary: "Upgrade the caller to a provider (cross-BC saga)",
    tags: ["Provider"],
  },
});

export const inviteProviderMember = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      email: z.string().email(),
      role: z.enum(["admin", "staff"]),
    }),
  ),
  output: zodSchema(z.object({ inviteId: z.string().min(1) })),
  docs: { summary: "Invite a member to a provider", tags: ["Provider"] },
});

export const acceptProviderInvite = defineMutation({
  input: zodSchema(z.object({ token: z.string().min(1) })),
  output: zodSchema(providerIdResult),
  docs: { summary: "Accept a provider invite", tags: ["Provider"] },
});

export const declineProviderInvite = defineMutation({
  input: zodSchema(z.object({ token: z.string().min(1) })),
  // `declined: false` when somebody else resolved it first — revoked, accepted
  // or expired. Not an error: the invitation is not going to happen either
  // way, which is what the person asked for.
  output: zodSchema(z.object({ declined: z.boolean() })),
  docs: { summary: "Decline a provider invite", tags: ["Provider"] },
});

export const revokeProviderInvite = defineMutation({
  input: zodSchema(
    z.object({ providerId: z.string().min(1), inviteId: z.string().min(1) }),
  ),
  output: zodSchema(okResult),
  docs: { summary: "Revoke a pending invite", tags: ["Provider"] },
});

export const removeProviderMember = defineMutation({
  input: zodSchema(
    z.object({ providerId: z.string().min(1), userId: z.string().min(1) }),
  ),
  output: zodSchema(okResult),
  docs: { summary: "Remove a member from a provider", tags: ["Provider"] },
});

export const updateProviderMemberRole = defineMutation({
  input: zodSchema(
    z.object({
      providerId: z.string().min(1),
      userId: z.string().min(1),
      role: z.enum(["owner", "admin", "staff"]),
    }),
  ),
  output: zodSchema(okResult),
  docs: { summary: "Change a member's role", tags: ["Provider"] },
});

export const providerWriteSchema = defineGraphQLSchema(
  {
    provider: {
      create: createProvider,
      update: updateProvider,
      deactivate: deactivateProvider,
      registerMe: registerMeAsProvider,
      invites: {
        send: inviteProviderMember,
        accept: acceptProviderInvite,
        decline: declineProviderInvite,
        revoke: revokeProviderInvite,
      },
      members: {
        remove: removeProviderMember,
        updateRole: updateProviderMemberRole,
      },
    },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
