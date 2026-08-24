import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  acceptInvite,
  inviteMember,
  providerQueries,
  removeMember,
  revokeInvite,
  updateMemberRole,
} from "../data/provider.repository";
import type { InviteMemberBody, ProviderRole } from "../domain/types";

/**
 * Accepting an invite adds the caller to a provider they may not have had
 * before, so "mine" needs invalidating even though this hook isn't scoped to
 * a single provider the way the others below are.
 */
export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => acceptInvite(token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: providerQueries.mine().queryKey });
    },
  });
}

export function useInviteMember(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteMemberBody) => inviteMember(providerId, body),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: providerQueries.byId(providerId).queryKey,
      });
    },
  });
}

export function useRevokeInvite(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(providerId, inviteId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: providerQueries.byId(providerId).queryKey,
      });
    },
  });
}

export function useRemoveMember(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(providerId, userId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: providerQueries.byId(providerId).queryKey,
      });
    },
  });
}

export function useUpdateMemberRole(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProviderRole }) =>
      updateMemberRole(providerId, userId, role),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: providerQueries.byId(providerId).queryKey,
      });
    },
  });
}
