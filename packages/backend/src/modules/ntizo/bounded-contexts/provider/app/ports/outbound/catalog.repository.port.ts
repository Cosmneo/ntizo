/**
 * The provider bounded context's one door onto the catalog.
 *
 * Membership is decided here, but a service left with nobody to perform it
 * is a catalog concern. `RemoveProviderMemberCommand` calls this after a
 * departing member's `service_member` rows are cascade-deleted, so every
 * published service of the workspace that the cascade left with nobody goes
 * to draft — a rule no foreign key can express, only a use case.
 */
export interface CatalogRepositoryPort {
  unpublishServicesWithoutMembers(providerId: string): Promise<{ serviceId: string; name: string }[]>;
}
