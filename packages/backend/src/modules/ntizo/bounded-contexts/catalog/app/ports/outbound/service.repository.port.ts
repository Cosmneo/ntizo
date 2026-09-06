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
  /**
   * This caller's own `provider_member.id` in this workspace, or null if
   * they are not a member.
   *
   * Distinct from {@link isProviderMember}: that answers "may they act here"
   * as a boolean, but `service_member.member_id` references
   * `provider_member.id`, not a user id — `CreateServiceCommand` needs this
   * to seed a newly-created service's creator as its first performer.
   */
  findMemberIdForUser(providerId: string, userId: string): Promise<string | null>;
  /**
   * Whether this person is this workspace's owner or an admin.
   *
   * A sibling of {@link isProviderMember}, not a parameter on it: describing
   * a service — creating it, pricing its options, translating it — is open to
   * any member, staff included, but deciding whether it is live is not. Only
   * `SetServiceStatusCommand` asks this question; every other command still
   * asks the plain one.
   */
  isProviderOwnerOrAdmin(providerId: string, userId: string): Promise<boolean>;
  /**
   * Whether the platform has approved this workspace.
   *
   * Asked only by `SetServiceStatusCommand`, and only on the way to
   * `published`. It reads the same column the storefront's own WHERE reads
   * (`provider.status = 'active'`, `conditionsFor` in
   * `service-read.repository.ts`), which is the point: those two are the
   * only places that decide whether a listing is live, and they must agree.
   *
   * On this port rather than reached for across bounded contexts, the same
   * precedent {@link isProviderOwnerOrAdmin} sets — catalog already asks the
   * provider tables questions through its own repository rather than
   * importing the provider context's.
   */
  isProviderActive(providerId: string): Promise<boolean>;
  /**
   * Whether this provider-member id belongs to this provider.
   *
   * The catalog's own copy of scheduling's `memberBelongsToProvider` — same
   * question, asked here because `SetServiceMembersCommand` validates a list
   * of member ids against the workspace before storing them, and this
   * bounded context does not reach into scheduling's repository for a query.
   */
  memberBelongsToProvider(providerId: string, memberId: string): Promise<boolean>;
  /**
   * Drafts every published service of this provider left with no rows in
   * `service_member`, and returns what changed so the caller can name them
   * back to the owner.
   *
   * Called by the provider bounded context's member-removal use case after
   * the departing member's `service_member` rows are cascade-deleted. A
   * foreign key cannot express "unpublish when the last performer is gone" —
   * only "prevent" or "cascade" — so this sweep is what stands in for the
   * rule the schema cannot state. It only ever touches `published` rows: a
   * draft or archived service left with nobody was already not live, and is
   * not this sweep's business.
   */
  unpublishServicesWithoutMembers(providerId: string): Promise<{ serviceId: string; name: string }[]>;
}
