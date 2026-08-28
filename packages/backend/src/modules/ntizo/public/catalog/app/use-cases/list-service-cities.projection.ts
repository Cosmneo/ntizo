import type { ServiceReadRepositoryPort } from "../../../../bounded-contexts/catalog/app/ports/outbound/service-read.repository.port";

/**
 * Its own class rather than a call straight to the adapter, so the handler
 * talks to a use case like every other slice here, not to an adapter.
 */
export class ListServiceCitiesProjection {
  constructor(private readonly repo: ServiceReadRepositoryPort) {}

  execute(): Promise<{ city: string; count: number }[]> {
    return this.repo.listCityFacets();
  }
}
