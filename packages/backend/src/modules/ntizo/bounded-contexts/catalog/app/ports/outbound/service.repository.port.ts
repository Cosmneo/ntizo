import type { Service } from "../../../domain/aggregates/service.aggregate";

export interface ServiceRepositoryPort {
  /** Null rather than throwing — "no such service" is an answer a stale link earns. */
  findById(serviceId: string): Promise<Service | null>;
  /** Writes the service and replaces its options and translations wholesale. */
  save(service: Service): Promise<void>;
  delete(serviceId: string): Promise<void>;
  /**
   * Whether this person may act for this workspace.
   *
   * On the repository because it is a query, and the kit's `argsMapper` is
   * synchronous — the handler cannot ask this from there.
   */
  isProviderMember(providerId: string, userId: string): Promise<boolean>;
}
