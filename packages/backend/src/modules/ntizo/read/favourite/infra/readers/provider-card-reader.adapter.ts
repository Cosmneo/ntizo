import type { ProviderPublicDTO } from "@ntizo/shared/read-models";
import {
  MAX_PUBLIC_PAGE_SIZE,
  type ListPublicProvidersProjection,
} from "../../../../public/provider/app/use-cases/list-public-providers.projection";
import type { ProviderCardReaderPort } from "../../app/ports/outbound/provider-card-reader.port";
import { chunk } from "./chunk";

/**
 * Resolves saved provider ids by asking the directory to do it.
 *
 * The twin of `DelegatedServiceCardReader`, and delegation for the same
 * reason: "listed" means `status === "active"`, and that rule lives in the
 * directory's repository. It is also the only route to a business by id at
 * all — `ProviderPublicRepositoryPort`'s single-row read is by slug, and a
 * favourite stores an id.
 *
 * `MAX_PUBLIC_PAGE_SIZE` is imported rather than restated so the chunk size
 * tracks that ceiling automatically.
 */
export class DelegatedProviderCardReader implements ProviderCardReaderPort {
  /** `Pick<…, "execute">` for the reason `DelegatedServiceCardReader` states. */
  constructor(private readonly providers: Pick<ListPublicProvidersProjection, "execute">) {}

  async findByIds(p: { ids: string[]; locale: string }): Promise<ProviderPublicDTO[]> {
    // An empty batch is not asked about: `ids: []` matches nothing by design.
    if (p.ids.length === 0) return [];

    const runs = chunk(p.ids, MAX_PUBLIC_PAGE_SIZE);
    const pages = await Promise.all(
      runs.map((ids) =>
        // `limit` is the run's own length, stated explicitly — never a default
        // page size, which would resolve some of a batch and report the rest
        // as gone.
        this.providers.execute({ ids, locale: p.locale, limit: ids.length, offset: 0 }),
      ),
    );

    return pages.flatMap((page) => page.items);
  }
}
