// Provider BC bootstrap — wires adapters into use cases.
// Mirrors the flowzao bootstrapOrganization() and ntizo bootstrapUser() shape:
// returns { adapters, useCases }.

import { bootstrapAdapters } from "./adapters.bootstrap";
import { bootstrapUseCases } from "./use-cases.bootstrap";

export function bootstrapProvider() {
  const adapters = bootstrapAdapters();
  const useCases = bootstrapUseCases(adapters);
  return { adapters, useCases };
}

export type ProviderBootstrap = ReturnType<typeof bootstrapProvider>;
