import { queryOptions } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type {
  CreateProviderBody,
  InviteMemberBody,
  ProviderDetail,
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
  // ProviderCreateInput doesn't accept `address` — the write-side mutation
  // never gained that field, so it's dropped here rather than sent and
  // silently ignored by the server.
  const { type, name, slug } = body;
  const d = await sessionGraphql<{ providerCreate: { providerId: string } }>(
    `mutation($input: ProviderCreateInput!) {
       providerCreate(input: $input) { providerId }
     }`,
    { input: { type, name, slug } },
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
  body: Partial<Pick<ProviderDetail, "name" | "description" | "address">>,
) {
  // ProviderUpdateInput only carries `name`/`description` on the backend —
  // `address` isn't part of the write-side mutation yet, so it's accepted
  // here (to keep this signature matching the old REST one, which kept
  // viewmodel/UI call sites unchanged) but never sent over the wire.
  const { name, description } = body;
  const d = await sessionGraphql<{ providerUpdate: { ok: true } }>(
    `mutation($input: ProviderUpdateInput!) {
       providerUpdate(input: $input) { ok }
     }`,
    { input: { providerId, name, description } },
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
