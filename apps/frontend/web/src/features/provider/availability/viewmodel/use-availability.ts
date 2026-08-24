import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { updateProvider } from "@/features/provider/data/provider.repository";
import {
  addClosure,
  addException,
  availabilityQueries,
  removeClosure,
  removeException,
  setWeeklyPattern,
  type AddExceptionInput,
  type SetWeeklyPatternInput,
} from "../data/availability.repository";

function availabilityKey(providerId: string) {
  return ["provider", "availability", providerId] as const;
}

/** A provider's whole availability configuration — every member's week, exceptions, closures and timezone. */
export function useAvailabilityConfig(providerId: string | undefined) {
  return useQuery(availabilityQueries.config(providerId ?? ""));
}

export function useSetWeeklyPattern(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<SetWeeklyPatternInput, "providerId">) =>
      setWeeklyPattern({ providerId, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: availabilityKey(providerId) }),
  });
}

export function useAddException(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<AddExceptionInput, "providerId">) => addException({ providerId, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: availabilityKey(providerId) }),
  });
}

export function useRemoveException(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { memberId: string; exceptionId: string }) =>
      removeException({ providerId, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: availabilityKey(providerId) }),
  });
}

export function useAddClosure(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { fromDate: string; toDate: string; note: string | null }) =>
      addClosure({ providerId, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: availabilityKey(providerId) }),
  });
}

export function useRemoveClosure(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (closureId: string) => removeClosure({ providerId, closureId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: availabilityKey(providerId) }),
  });
}

/**
 * Sets a workspace's timezone through `provider.update` — the availability
 * screen's own field on an existing, already-shipped mutation, not a new
 * one. Invalidates this feature's own query key (not `["providers", ...]`,
 * which `provider.repository.ts`'s own callers manage) so the timezone
 * shown on this screen reflects the save immediately.
 */
export function useSetProviderTimezone(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (timezone: string) => updateProvider(providerId, { timezone }),
    onSuccess: () => qc.invalidateQueries({ queryKey: availabilityKey(providerId) }),
  });
}
