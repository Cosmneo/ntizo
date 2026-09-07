import type {
  FavouriteEntryDTO,
  FavouriteListDTO,
  FavouriteListPageDTO,
} from "@ntizo/shared/read-models";

/**
 * What can be saved. Two kinds, and never a third by accident: the server's
 * own schema declares `z.enum(["service", "provider"])` on every one of the
 * nine fields, and a value outside it comes back `VALIDATION_ERROR` rather
 * than an empty answer.
 *
 * A card knows which it is, so this rides in the query key and in every
 * input — a service and a provider can legitimately share an id, and marks
 * for one must never fill the other's heart.
 */
export const FAVOURITE_TARGET_TYPES = ["service", "provider"] as const;
export type FavouriteTargetType = (typeof FAVOURITE_TARGET_TYPES)[number];

/**
 * The read models, re-exported under this feature's own names rather than
 * redeclared.
 *
 * A second, hand-written copy of `favouriteListReadModel` here would be a
 * second definition of what a list is, and the two would drift the first time
 * a field is added server-side — the same reason `favouriteEntryReadModel`
 * carries the browse pages' own `serviceReadModel`/`providerPublicReadModel`
 * instead of narrowed copies.
 */
export type FavouriteList = FavouriteListDTO;
export type FavouriteEntry = FavouriteEntryDTO;
export type FavouriteListPage = FavouriteListPageDTO;

/**
 * The most listings one `favouriteMarked` call may ask about.
 *
 * The server's own bound (`z.array(...).max(48)`, itself `MAX_SERVICE_PAGE` —
 * the most cards a browse page can hold), so asking about more comes back
 * `VALIDATION_ERROR`, not a silently truncated answer. Named here so a caller
 * batching a longer list has a number to slice on rather than finding the
 * bound on the wire — the lesson `THREADS_PAGE_SIZE` and `ACTIVITY_PAGE_SIZE`
 * already paid for.
 */
export const FAVOURITE_MARKS_MAX_IDS = 48;

/**
 * The longest a list name may be — `favourite_list.name`'s column width and
 * the server's `z.string().trim().min(1).max(60)`.
 *
 * A dialog built on `useCreateList` has to stop somebody at this length
 * rather than let them find out on submit.
 */
export const FAVOURITE_LIST_NAME_MAX_LENGTH = 60;
