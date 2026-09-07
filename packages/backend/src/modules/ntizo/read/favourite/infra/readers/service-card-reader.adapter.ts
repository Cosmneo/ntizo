import type { ServiceDTO } from "@ntizo/shared/read-models";
import {
  MAX_SERVICE_PAGE,
  type ListServicesProjection,
} from "../../../../public/catalog/app/use-cases/list-services.projection";
import type { ServiceCardReaderPort } from "../../app/ports/outbound/service-card-reader.port";
import { chunk } from "./chunk";

/**
 * Resolves saved service ids by asking the browse to do it.
 *
 * Delegation, not a query of its own, and the port's doc comment carries the
 * argument: `ListServicesProjection` is where "visible" is defined — published,
 * the provider active, and a name that resolves in some locale, falling back
 * to the provider's own `sourceLocale` rather than the platform default. A
 * favourites page that read `service` directly would be a second definition of
 * the same rule, and the day they disagree is the day `/favourites` shows a
 * listing `/services` has stopped showing.
 *
 * `MAX_SERVICE_PAGE` is imported rather than restated so the chunk size tracks
 * that ceiling automatically. It is 48, and the entries page can ask for up to
 * 50 — see `chunk`'s own comment for why the difference must not be handled by
 * truncating.
 */
export class DelegatedServiceCardReader implements ServiceCardReaderPort {
  /**
   * `Pick<…, "execute">` rather than the class itself: the bootstrap hands in
   * the real projection, and a test can hand in the one method this adapter
   * uses without also standing up a repository and a database behind it.
   */
  constructor(private readonly services: Pick<ListServicesProjection, "execute">) {}

  async findByIds(p: { ids: string[]; locale: string }): Promise<ServiceDTO[]> {
    // An empty batch is not asked about: `ids: []` matches nothing by design,
    // so the query would be a round trip whose answer is already known.
    if (p.ids.length === 0) return [];

    const runs = chunk(p.ids, MAX_SERVICE_PAGE);
    const pages = await Promise.all(
      runs.map((ids) =>
        // `limit` is the run's own length, stated explicitly. Leaning on a
        // default page size here would resolve the first 24 of a 50-favourite
        // page and report the other 26 as deleted.
        this.services.execute({ ids, locale: p.locale, limit: ids.length, offset: 0 }),
      ),
    );

    return pages.flatMap((page) => page.items);
  }
}
