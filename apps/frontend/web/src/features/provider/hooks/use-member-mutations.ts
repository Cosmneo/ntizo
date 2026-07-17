import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  inviteMember,
  removeMember,
  revokeInvite,
  updateMemberRole,
} from "../lib/provider-api";
import { providerKeys } from "./use-providers";
import type { InviteMemberBody, ProviderRole } from "../types";

export function useInviteMember(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteMemberBody) => inviteMember(providerId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: providerKeys.detail(providerId) });
    },
  });
}

export function useRevokeInvite(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(providerId, inviteId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: providerKeys.detail(providerId) });
    },
  });
}

export function useRemoveMember(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(providerId, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: providerKeys.detail(providerId) });
    },
  });
}

export function useUpdateMemberRole(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProviderRole }) =>
      updateMemberRole(providerId, userId, role),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: providerKeys.detail(providerId) });
    },
  });
}
