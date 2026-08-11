import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ServiceStatus } from "@ntizo/shared";
import type { SelectOption } from "@ntizo/frontend-ui";
import { categoryPickerQueries } from "../data/category-picker.repository";
import {
  addServiceOption,
  createService,
  removeServiceOption,
  reorderServiceOptions,
  setServiceStatus,
  setServiceTranslation,
  updateService,
  updateServiceOption,
  type CreateServiceInput,
  type ServiceOptionInput,
  type SetServiceTranslationInput,
} from "../data/service.repository";
import type { ProviderService, ServiceOption } from "../domain/types";

/** The categories a provider can file a service under, as `Select` options. */
export function useCategoryOptions() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const query = useQuery(categoryPickerQueries.all(locale));

  const options: SelectOption[] = useMemo(
    () => (query.data ?? []).map((c) => ({ value: c.id, label: c.name, hint: c.code })),
    [query.data],
  );

  return { options, loading: query.isLoading, error: query.error };
}

function servicesKey(providerId: string) {
  return ["provider", "services", providerId] as const;
}

export interface SaveServiceInput extends CreateServiceInput {
  /** Present on an existing service — absent is what tells this to create instead. */
  serviceId?: string;
}

/**
 * Creates a service, or saves an existing one's category/location and its
 * source-language name/description.
 *
 * Two calls on the update path (`service.update` for the category and
 * location, `service.translation.set` for the name and description) because
 * the server keeps them separate: `service.update` has no name field at all,
 * since a service's copy is a translation like any other and Task 12's
 * sheet writes the other seven languages through the very same mutation.
 * `providerId`/`bookingMode` are only read on the create path, but the
 * caller sends the same shape either way — one object built once, rather
 * than two call sites that could drift out of sync with each other.
 * Resolves to the service's id either way, so the caller can move from
 * "composing" to "editing" the moment a brand-new service exists.
 */
export function useSaveService(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveServiceInput): Promise<string> => {
      if (input.serviceId) {
        await updateService({
          serviceId: input.serviceId,
          categoryId: input.categoryId,
          locationType: input.locationType,
        });
        await setServiceTranslation({
          serviceId: input.serviceId,
          locale: input.sourceLocale,
          name: input.name,
          description: input.description,
        });
        return input.serviceId;
      }
      const { serviceId } = await createService(input);
      return serviceId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesKey(providerId) }),
  });
}

export function useSetServiceStatus(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { serviceId: string; status: ServiceStatus }) => setServiceStatus(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesKey(providerId) }),
  });
}

/**
 * Writes one language's copy for a service or, with `optionId`, for one of
 * its options.
 *
 * Its own mutation rather than folded into `useSaveService`: the
 * translations sheet calls this once per box, one language at a time, and
 * `useSaveService` only ever writes the source locale as half of a bigger
 * save. Invalidates the same list `useSaveService` does, so the sheet's own
 * "which languages are filled in" reflects a save the moment it lands,
 * without a query of its own.
 */
export function useSetServiceTranslation(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetServiceTranslationInput) => setServiceTranslation(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesKey(providerId) }),
  });
}

export function useAddServiceOption(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ServiceOptionInput) => addServiceOption(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesKey(providerId) }),
  });
}

export function useUpdateServiceOption(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ServiceOptionInput> & { serviceId: string; optionId: string }) =>
      updateServiceOption(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesKey(providerId) }),
  });
}

export function useRemoveServiceOption(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { serviceId: string; optionId: string }) => removeServiceOption(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesKey(providerId) }),
  });
}

/**
 * Writes a new option order, optimistically.
 *
 * The same shape as the admin category list's reorder mutation, and for the
 * same reason: a drag that snapped back to its start for the length of a
 * round trip would read as having failed. Scoped to the one service's
 * options inside the cached list — the other services in the same query
 * result are left untouched.
 */
export function useReorderServiceOptions(providerId: string, serviceId: string) {
  const qc = useQueryClient();
  const queryKey = servicesKey(providerId);
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderServiceOptions({ serviceId, orderedIds }),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<ProviderService[]>(queryKey);
      if (previous) {
        qc.setQueryData<ProviderService[]>(
          queryKey,
          previous.map((service) => {
            if (service.id !== serviceId) return service;
            const byId = new Map(service.options.map((o) => [o.id, o] as [string, ServiceOption]));
            return {
              ...service,
              options: orderedIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
            };
          }),
        );
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });
}
