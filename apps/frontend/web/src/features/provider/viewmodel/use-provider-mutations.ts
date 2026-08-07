import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createProvider,
  deactivateProvider,
  providerQueries,
  registerMe,
  updateProvider,
} from "../data/provider.repository";
import type { CreateProviderBody, RegisterMeBody, ProviderDetail } from "../domain/types";

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProviderBody) => createProvider(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: providerQueries.mine().queryKey });
    },
  });
}

export function useRegisterMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterMeBody = {}) => registerMe(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: providerQueries.mine().queryKey });
    },
  });
}

export function useUpdateProvider(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<ProviderDetail, "name" | "description" | "address">>) =>
      updateProvider(providerId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: providerQueries.mine().queryKey });
      void qc.invalidateQueries({ queryKey: providerQueries.byId(providerId).queryKey });
    },
  });
}

export function useDeactivateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) => deactivateProvider(providerId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: providerQueries.mine().queryKey });
    },
  });
}
