import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

const providerIdResult = z.object({ providerId: z.string().min(1) });
const okResult = z.object({ ok: z.literal(true) });

export const createProvider = defineMutation({
  input: zodSchema(
    z.object({
      type: z.enum(["individual", "organization"]),
      name: z.string().min(1),
      slug: z.string().min(1),
      description: z.string().optional(),
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
