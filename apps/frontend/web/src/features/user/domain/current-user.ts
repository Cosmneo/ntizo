/**
 * The authenticated user's profile, as returned by the `userMe` GraphQL
 * query. Re-exported here so this feature's `data/` and `viewmodel/` layers
 * pull the type from `domain/` rather than reaching into `@ntizo/shared`
 * directly — the layer boundaries lint requires `domain/` itself to be
 * import-free (see `features/provider/domain/types.ts` for the precedent:
 * `ProviderSummary = ProviderListItemDTO`). Note this doesn't make
 * `domain/` the only place `CurrentUserDTO` is imported from app-wide:
 * `shared/lib/zones.ts` and `routes/admin/admin-guard.ts` predate this
 * feature and still import it straight from `@ntizo/shared`.
 */
export type { CurrentUserDTO } from "@ntizo/shared";
