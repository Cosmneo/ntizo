import { PROVIDER_STATUSES, type ProviderStatus } from "@ntizo/shared";

export interface ProvidersSearch {
  status?: ProviderStatus;
}

/** `?status=pending` narrows the list on arrival — the dashboard's card links here already filtered. Anything else is ignored. */
export function parseProvidersSearch(search: Record<string, unknown>): ProvidersSearch {
  const status = search["status"];
  return {
    status:
      typeof status === "string" && (PROVIDER_STATUSES as readonly string[]).includes(status)
        ? (status as ProviderStatus)
        : undefined,
  };
}
