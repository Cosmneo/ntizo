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
  setServiceMembers,
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
  /** Who performs it, as the form's checkboxes currently read. Ignored when `skipMembers` is set. */
  memberIds: string[];
  /**
   * An individual provider has one member and no checkbox list to change it
   * from — `true` skips `service.members.set` entirely rather than sending
   * it with whatever `memberIds` happens to hold. On create, the server has
   * already seeded the creator as the sole performer
   * (`CreateServiceCommand`); a follow-up `members.set` with a stale or
   * empty list would remove them — exactly the mistake the brief warns
   * against. On update, there is nothing this call could legitimately change.
   *
   * That "stale or empty list" risk on create is not fully covered by this
   * flag alone: an organization's `skipMembers` is `false`, and `memberIds`
   * can still legitimately be `[]` at submit time if `useAvailabilityConfig`
   * or `useCurrentUser` simply hasn't resolved yet — the checkbox list
   * renders with nothing pre-ticked, and nothing stops a submit from firing
   * on a draft in that state. See `saveService`'s create branch for the
   * second, independent guard this requires.
   */
  skipMembers: boolean;
}

/**
 * Creates a service, or saves an existing one's category/location and its
 * source-language name/description — and, for an organization, who
 * performs it.
 *
 * Three calls on the update path (`service.update` for the category and
 * location; `service.translation.set` for the name and description;
 * `service.members.set` for the performer list) because the
 * server keeps every one of them separate: `service.update` has no name
 * field at all, since a service's copy is a translation like any other, and
 * membership has its own refusal (`SERVICE_NEEDS_MEMBER`) that only makes
 * sense asked on its own. `providerId`/`bookingMode` are only read on the
 * create path, but the caller sends the same shape either way — one object
 * built once, rather than two call sites that could drift out of sync with
 * each other. Resolves to the service's id either way, so the caller can
 * move from "composing" to "editing" the moment a brand-new service exists.
 *
 * A plain exported function, not inlined into `useMutation`'s `mutationFn` —
 * that used to be the only way to reach this logic at all, and a version of
 * it that forwarded the whole `SaveServiceInput` straight to `createService`
 * (rather than building `ServiceCreateInput`'s own literal, as below) sent
 * `memberIds`/`skipMembers` along for the ride. GraphQL input types reject
 * fields they don't declare outright, so every create failed with "Field
 * \"memberIds\" is not defined by type \"ServiceCreateInput\"" — caught only
 * by driving the real form against a live server, not by a unit test, since
 * there was nothing exported here to point one at. There is, now.
 */
export async function saveService(input: SaveServiceInput): Promise<string> {
  if (input.serviceId) {
    // In parallel, not one after another. These are three writes to three
    // different tables with no ordering between them, and the wizard blocks
    // its own step change on this call — in sequence they were three round
    // trips a provider waited through on every Continue.
    //
    // Unlike create below, an empty `memberIds` here IS a real instruction —
    // a draft service with every performer unticked means "nobody performs
    // this yet", and that has to reach the server so `service.members.set`
    // can actually clear it. There is no unresolved-query ambiguity on
    // update: this path is only reached once the member list has already
    // rendered checkboxes for someone to untick.
    await Promise.all([
      updateService({
        serviceId: input.serviceId,
        categoryId: input.categoryId,
        locationType: input.locationType,
      }),
      setServiceTranslation({
        serviceId: input.serviceId,
        locale: input.sourceLocale,
        name: input.name,
        description: input.description,
      }),
      ...(input.skipMembers
        ? []
        : [setServiceMembers({ serviceId: input.serviceId, memberIds: input.memberIds })]),
    ]);
    return input.serviceId;
  }
  const { serviceId } = await createService({
    providerId: input.providerId,
    categoryId: input.categoryId,
    sourceLocale: input.sourceLocale,
    locationType: input.locationType,
    bookingMode: input.bookingMode,
    name: input.name,
    description: input.description,
  });
  // An empty `memberIds` here is not an instruction — nobody has actually
  // said "nobody performs this yet", because a *create* was still being
  // typed while the checkbox list was blank. It's what an unresolved
  // `useAvailabilityConfig`/`useCurrentUser` looks like. The server has
  // already seeded the creator as this service's first performer
  // (`CreateServiceCommand`); sending `[]` here would faithfully strip that
  // seed. So create only ever calls `service.members.set` when there is a
  // real, non-empty list to send — unlike update below, where an empty list
  // is exactly what "nobody performs this yet" looks like and must go
  // through.
  if (!input.skipMembers && input.memberIds.length > 0) {
    await setServiceMembers({ serviceId, memberIds: input.memberIds });
  }
  return serviceId;
}

export function useSaveService(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveService,
    // `void`, not `return`: returning the promise makes react-query await the
    // refetch before `mutateAsync` resolves, and the wizard blocks its step
    // change on that. The save is done when the server says so; the list
    // catching up is not something a provider should wait for.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: servicesKey(providerId) });
    },
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
