import { queryOptions } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type {
  CreateProviderBody,
  InviteMemberBody,
  ProviderDetail,
  UpdateProviderBody,
  ProviderRole,
  ProviderSummary,
  RegisterMeBody,
} from "../domain/types";

const MINE = `
  query ProviderMine($input: JSON!) {
    providerMine(input: $input) { id name slug type status role }
  }`;

const BY_ID = `
  query ProviderById($input: ProviderByIdInput!) {
    providerById(input: $input) {
      id name slug type status description ownerUserId
      address { street city district country postalCode }
      logo { key url }
      photos { key url }
      documents { id type status fileName uploadedAt reviewedAt rejectionReason }
      reverificationRequestedAt
      members { userId email name role joinedAt }
      invites { id email role status }
    }
  }`;

/** Query definitions. Components consume these via useQuery(providerQueries.x()). */
export const providerQueries = {
  mine: () =>
    queryOptions({
      queryKey: ["providers", "mine"] as const,
      queryFn: async () => {
        const d = await sessionGraphql<{ providerMine: ProviderSummary[] }>(MINE, {
          input: {},
        });
        return d.providerMine;
      },
    }),

  byId: (providerId: string) =>
    queryOptions({
      queryKey: ["providers", providerId] as const,
      queryFn: async () => {
        const d = await sessionGraphql<{ providerById: ProviderDetail }>(BY_ID, {
          input: { providerId },
        });
        return d.providerById;
      },
    }),
};

export async function createProvider(body: CreateProviderBody) {
  // The whole body. `address` used to be stripped here with a comment saying
  // the mutation did not accept one — true when it was written, and it stayed
  // true-looking after the mutation gained the field, because a dropped
  // argument fails silently: the wizard collected a country and a city, the
  // request left without them, and the row came back with nulls.
  const d = await sessionGraphql<{ providerCreate: { providerId: string } }>(
    `mutation($input: ProviderCreateInput!) {
       providerCreate(input: $input) { providerId }
     }`,
    { input: body },
  );
  return d.providerCreate;
}

export async function registerMe(body: RegisterMeBody = {}) {
  const d = await sessionGraphql<{ providerRegisterMe: { providerId: string } }>(
    `mutation($input: ProviderRegisterMeInput!) {
       providerRegisterMe(input: $input) { providerId }
     }`,
    { input: { ...body } },
  );
  return d.providerRegisterMe;
}

export async function updateProvider(
  providerId: string,
  body: UpdateProviderBody,
) {
  // The whole body, `address` included. It used to be accepted here and
  // dropped — the same silent discard `createProvider` had, and with the same
  // result: the settings page greyed its address block out under "temporarily
  // unavailable" and nothing was ever going to change that but this line.
  const d = await sessionGraphql<{ providerUpdate: { ok: true } }>(
    `mutation($input: ProviderUpdateInput!) {
       providerUpdate(input: $input) { ok }
     }`,
    { input: { providerId, ...body } },
  );
  return d.providerUpdate;
}

export async function deactivateProvider(providerId: string) {
  const d = await sessionGraphql<{ providerDeactivate: { ok: true } }>(
    `mutation($input: ProviderDeactivateInput!) {
       providerDeactivate(input: $input) { ok }
     }`,
    { input: { providerId } },
  );
  return d.providerDeactivate;
}

export async function inviteMember(providerId: string, body: InviteMemberBody) {
  const d = await sessionGraphql<{ providerInvitesSend: { inviteId: string } }>(
    `mutation($input: ProviderInvitesSendInput!) {
       providerInvitesSend(input: $input) { inviteId }
     }`,
    { input: { providerId, ...body } },
  );
  return d.providerInvitesSend;
}

export async function acceptInvite(token: string) {
  const d = await sessionGraphql<{ providerInvitesAccept: { providerId: string } }>(
    `mutation($input: ProviderInvitesAcceptInput!) {
       providerInvitesAccept(input: $input) { providerId }
     }`,
    { input: { token } },
  );
  return d.providerInvitesAccept;
}

export async function revokeInvite(providerId: string, inviteId: string) {
  const d = await sessionGraphql<{ providerInvitesRevoke: { ok: true } }>(
    `mutation($input: ProviderInvitesRevokeInput!) {
       providerInvitesRevoke(input: $input) { ok }
     }`,
    { input: { providerId, inviteId } },
  );
  return d.providerInvitesRevoke;
}

export async function removeMember(providerId: string, userId: string) {
  const d = await sessionGraphql<{ providerMembersRemove: { ok: true } }>(
    `mutation($input: ProviderMembersRemoveInput!) {
       providerMembersRemove(input: $input) { ok }
     }`,
    { input: { providerId, userId } },
  );
  return d.providerMembersRemove;
}

export async function updateMemberRole(
  providerId: string,
  userId: string,
  role: ProviderRole,
) {
  const d = await sessionGraphql<{ providerMembersUpdateRole: { ok: true } }>(
    `mutation($input: ProviderMembersUpdateRoleInput!) {
       providerMembersUpdateRole(input: $input) { ok }
     }`,
    { input: { providerId, userId, role } },
  );
  return d.providerMembersUpdateRole;
}
