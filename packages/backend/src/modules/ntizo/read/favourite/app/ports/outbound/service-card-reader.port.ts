import type { ServiceDTO } from "@ntizo/shared/read-models";

/**
 * A batch of saved services, resolved into the card a favourites page draws.
 *
 * A read-tier port of its own, the same shape `read/communication`'s
 * `ProviderNameReaderPort` uses and for the same reason: the catalog's write
 * tier owns no batched "these ids, as cards" read, and a favourites page needs
 * one — a page of twenty-four saved services must cost one query, not
 * twenty-four.
 *
 * **The adapter delegates; it does not query the tables.** This is where this
 * port differs from `ProviderNameReaderPort`, which reads `provider.name`
 * directly — and the difference is worth stating so nobody "simplifies" this
 * into a direct query. That port resolves one column, and a column has no
 * visibility rule to get wrong. This one resolves a whole *gated* read model:
 * a favourite pointing at something deleted, unpublished, or belonging to a
 * suspended provider is resolved away on read, which is the same rule the
 * browse already applies to its own rows. That rule lives in
 * `ListServicesProjection` — published AND the provider active, plus a name
 * that resolves in some locale. An adapter here reading `service` directly
 * would be a second copy of "what visible means", and the two will drift; at
 * which point `/favourites` shows a listing `/services` has stopped showing.
 * Delegating means there is one definition and favourites inherits it.
 *
 * `locale` is the reader's language, not the listing's: the name and
 * description come back already resolved, falling back to the provider's own
 * `sourceLocale` rather than to the platform default. That is the whole reason
 * this port takes a locale at all, and the reason it is passed down rather
 * than defaulted per call site.
 */
export interface ServiceCardReaderPort {
  /**
   * The services with these ids that a reader may see, in no guaranteed order.
   *
   * An id absent from the result is a service that no longer resolves — gone,
   * unpublished, its provider suspended, or with no readable name in any
   * locale. The caller drops that entry; it never renders as a gap.
   *
   * Duplicates in `ids` are the caller's problem to avoid; this returns at
   * most one row per id either way.
   */
  findByIds(p: { ids: string[]; locale: string }): Promise<ServiceDTO[]>;
}
