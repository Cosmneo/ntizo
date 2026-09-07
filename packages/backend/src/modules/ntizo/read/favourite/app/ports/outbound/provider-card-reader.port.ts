import type { ProviderPublicDTO } from "@ntizo/shared/read-models";

/**
 * A batch of saved businesses, resolved into the card a favourites page draws.
 *
 * The twin of {@link ServiceCardReaderPort}, and everything that port's doc
 * comment says about delegating rather than querying applies here word for
 * word: the visibility rule — a business is resolvable only while it is
 * `active` — lives in `ListPublicProvidersProjection` and its repository, and a
 * second copy of it here would drift from the directory's.
 *
 * There is a second reason this port has to exist at all rather than the
 * projection calling the public repository straight: `ProviderPublicRepositoryPort`
 * has no by-id read. Its only single-row method is `findActiveBySlug`, and a
 * favourite stores a provider **id**, never a slug — so there is no path at all
 * from a saved row to that method.
 */
export interface ProviderCardReaderPort {
  /**
   * The businesses with these ids that a reader may see, in no guaranteed
   * order.
   *
   * An id absent from the result is a business that no longer resolves — gone,
   * or no longer active. The caller drops that entry; it never renders as a
   * gap.
   */
  findByIds(p: { ids: string[]; locale: string }): Promise<ProviderPublicDTO[]>;
}
