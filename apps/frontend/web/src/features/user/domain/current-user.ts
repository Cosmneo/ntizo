/**
 * The authenticated user's profile, as returned by the `userMe` GraphQL
 * query. Re-exported here (rather than importing `@ntizo/shared` directly
 * from `data/` or `viewmodel/`) so this feature's read-model type has a
 * single source of truth inside `domain/` — the layer boundaries lint
 * requires it to be import-free (see `features/provider/domain/types.ts`
 * for the precedent: `ProviderSummary = ProviderListItemDTO`).
 */
export type { CurrentUserDTO } from "@ntizo/shared";
