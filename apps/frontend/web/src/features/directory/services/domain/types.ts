import type { ServiceDTO, ServicePageDTO } from "@ntizo/shared/read-models";

export type { ServiceDTO, ServicePageDTO };

/**
 * The one priced option a card may show.
 *
 * `service.all` already resolves an entire options list down to this single
 * default server-side — see `servicePublicOptionReadModel`. There is no
 * array on the wire for this feature to index into; `NonNullable` just names
 * the shape once instead of every function re-deriving it from `ServiceDTO`.
 */
export type ServicePublicOptionDTO = NonNullable<ServiceDTO["defaultOption"]>;

/**
 * How many services the platform-wide browse asks for at a time.
 *
 * In `domain/` rather than beside the query it parameterises, because the
 * paging links need it too — how far "previous" steps back is the same number
 * — and `ui/` may not reach `data/`.
 *
 * Below the server's own cap of 48 so the number lives here rather than being
 * silently clamped there: a page size that changes when somebody edits a
 * constant in another package is a page size nobody can reason about.
 */
export const BROWSE_PAGE_SIZE = 24;

/**
 * The longest search term the browse will send.
 *
 * The same 100 the GraphQL schema accepts. Enforced here as well so a pasted
 * essay is truncated into a search rather than rejected by the server — a
 * validation error blanks the page, and whoever pasted it has no way to see
 * why.
 */
export const MAX_SEARCH_LENGTH = 100;

/**
 * How the browse orders its results.
 *
 * `default` is the provider's own arrangement — their answer to "what do I
 * want shown first". `newest` ignores it rather than ordering within it: a
 * reader who asked for the newest is asking a different question, and one
 * provider's arrangement should not outrank another's recency.
 */
export type BrowseSort = "newest";
