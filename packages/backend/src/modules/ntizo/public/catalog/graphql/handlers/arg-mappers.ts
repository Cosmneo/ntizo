import { DEFAULT_LOCALE } from "@ntizo/shared";
import type { ListServicesInput } from "../../app/use-cases/list-services.projection";

/** How many services a request without a `limit` asks for. */
const DEFAULT_SERVICE_LIMIT = 24;

/**
 * The GraphQL arguments of `service.all`, as the projection wants them.
 *
 * A named function rather than an inline `argsMapper`, so it can be tested on
 * its own — and it needs to be. The mapper lists its fields one by one, so a
 * field added to the schema and forgotten here passes validation and is then
 * silently dropped: the query succeeds, the filter does nothing, and the page
 * reads as having no matching data rather than as being broken. `locationType`
 * and `sort` shipped doing exactly that, and the projection's own unit tests
 * were green throughout, because the projection was never handed them.
 *
 * The defaults live here rather than in the zod schema because a zod
 * `.default()` does not survive into the generated GraphQL schema — the
 * schema says `.optional()` and this is where the fallback actually runs.
 */
export function mapListServicesInput(input: {
  locale?: string | undefined;
  categoryCode?: string | undefined;
  providerId?: string | undefined;
  locationType?: string | undefined;
  q?: string | undefined;
  sort?: "default" | "newest" | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}): ListServicesInput {
  return {
    locale: input.locale ?? DEFAULT_LOCALE,
    categoryCode: input.categoryCode,
    providerId: input.providerId,
    locationType: input.locationType,
    q: input.q,
    sort: input.sort,
    limit: input.limit ?? DEFAULT_SERVICE_LIMIT,
    offset: input.offset ?? 0,
  };
}
