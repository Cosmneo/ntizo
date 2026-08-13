import { queryOptions } from "@tanstack/react-query";
import type { ServiceBookingMode, ServiceLocationType, ServicePricingMode, ServiceStatus } from "@ntizo/shared";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { ProviderService } from "../domain/types";

const MINE = `
  query ServiceMine($input: ServiceMineInput!) {
    serviceMine(input: $input) {
      id categoryId categoryCode sourceLocale locationType bookingMode status imageUrls
      memberIds
      translations { locale name description }
      options {
        id pricingMode amountMinor currency durationMinutes minMinutes stepMinutes
        isDefault isActive sortOrder
        translations { locale name }
      }
    }
  }`;

const CREATE = `
  mutation ServiceCreate($input: ServiceCreateInput!) {
    serviceCreate(input: $input) { serviceId }
  }`;

const UPDATE = `
  mutation ServiceUpdate($input: ServiceUpdateInput!) {
    serviceUpdate(input: $input) { ok }
  }`;

const SET_STATUS = `
  mutation ServiceSetStatus($input: ServiceSetStatusInput!) {
    serviceSetStatus(input: $input) { ok }
  }`;

const TRANSLATION_SET = `
  mutation ServiceTranslationSet($input: ServiceTranslationSetInput!) {
    serviceTranslationSet(input: $input) { ok }
  }`;

const OPTION_ADD = `
  mutation ServiceOptionsAdd($input: ServiceOptionsAddInput!) {
    serviceOptionsAdd(input: $input) { optionId }
  }`;

const OPTION_UPDATE = `
  mutation ServiceOptionsUpdate($input: ServiceOptionsUpdateInput!) {
    serviceOptionsUpdate(input: $input) { ok }
  }`;

const OPTION_REMOVE = `
  mutation ServiceOptionsRemove($input: ServiceOptionsRemoveInput!) {
    serviceOptionsRemove(input: $input) { ok }
  }`;

const OPTION_REORDER = `
  mutation ServiceOptionsReorder($input: ServiceOptionsReorderInput!) {
    serviceOptionsReorder(input: $input) { ok }
  }`;

const SET_MEMBERS = `
  mutation ServiceMembersSet($input: ServiceMembersSetInput!) {
    serviceMembersSet(input: $input) { ok }
  }`;

export const serviceQueries = {
  mine: (providerId: string) =>
    queryOptions({
      queryKey: ["provider", "services", providerId],
      queryFn: async (): Promise<ProviderService[]> => {
        const d = await sessionGraphql<{ serviceMine: ProviderService[] }>(MINE, {
          input: { providerId },
        });
        return d.serviceMine;
      },
      // Only once there is a workspace to ask about — without this the page
      // fires a query with an empty providerId while `useActiveProvider` is
      // still loading, the same guard the wallet query uses.
      enabled: providerId.length > 0,
    }),
};

export interface CreateServiceInput {
  providerId: string;
  categoryId: string;
  sourceLocale: string;
  locationType: ServiceLocationType;
  bookingMode: ServiceBookingMode;
  name: string;
  description: string | null;
}

export async function createService(input: CreateServiceInput): Promise<{ serviceId: string }> {
  const d = await sessionGraphql<{ serviceCreate: { serviceId: string } }>(CREATE, { input });
  return d.serviceCreate;
}

export interface UpdateServiceInput {
  serviceId: string;
  categoryId: string;
  locationType: ServiceLocationType;
}

export async function updateService(input: UpdateServiceInput): Promise<void> {
  await sessionGraphql(UPDATE, { input });
}

/**
 * Sets who performs a service — the whole set, not an add/remove delta.
 * Empty is a real instruction for a draft; refused for a published service
 * with `SERVICE_NEEDS_MEMBER`, which the service editor maps under this
 * form's own performer field rather than the generic save-failed banner.
 */
export async function setServiceMembers(input: { serviceId: string; memberIds: string[] }): Promise<void> {
  await sessionGraphql(SET_MEMBERS, { input });
}

export async function setServiceStatus(input: { serviceId: string; status: ServiceStatus }): Promise<void> {
  await sessionGraphql(SET_STATUS, { input });
}

export interface SetServiceTranslationInput {
  serviceId: string;
  optionId?: string;
  locale: string;
  name: string;
  description: string | null;
}

export async function setServiceTranslation(input: SetServiceTranslationInput): Promise<void> {
  await sessionGraphql(TRANSLATION_SET, { input });
}

export interface ServiceOptionInput {
  serviceId: string;
  name: string;
  pricingMode: ServicePricingMode;
  amountMinor: number;
  currency: string;
  durationMinutes: number | null;
  minMinutes: number | null;
  stepMinutes: number | null;
}

export async function addServiceOption(input: ServiceOptionInput): Promise<{ optionId: string }> {
  const d = await sessionGraphql<{ serviceOptionsAdd: { optionId: string } }>(OPTION_ADD, { input });
  return d.serviceOptionsAdd;
}

export async function updateServiceOption(
  input: Partial<ServiceOptionInput> & { serviceId: string; optionId: string },
): Promise<void> {
  await sessionGraphql(OPTION_UPDATE, { input });
}

export async function removeServiceOption(input: { serviceId: string; optionId: string }): Promise<void> {
  await sessionGraphql(OPTION_REMOVE, { input });
}

export async function reorderServiceOptions(input: {
  serviceId: string;
  orderedIds: string[];
}): Promise<void> {
  await sessionGraphql(OPTION_REORDER, { input });
}
