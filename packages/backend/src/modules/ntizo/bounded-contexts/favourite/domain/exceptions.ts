import { ConflictError, ForbiddenError, UnprocessableError } from "@cosmneo/onion-lasagna";

/**
 * The favourite context's refusals.
 *
 * Each extends a kit error type so `getGraphQLErrorCode` recognises it and the
 * GraphQL layer stops masking it to `INTERNAL_ERROR`. Subclassing plain
 * `Error` with a bolted-on `code` property is not enough — it compiles, it
 * reads correctly, and this is the exact mistake `catalog/domain/exceptions.ts`
 * documents reaching the browser as "An unexpected error occurred". Do not
 * "simplify" this back to `Error`.
 */

/**
 * A row whose `targetType` is not one of {@link FAVOURITE_TARGETS}.
 *
 * Thrown by `Favourite.file`. A row of an unknown kind is unreadable by every
 * projection and would sit in a list forever as a gap nothing renders — this
 * refuses it before it is ever written.
 */
export class UnknownFavouriteTargetError extends UnprocessableError {
  constructor(public readonly targetType: string) {
    super({
      message: `Unknown favourite target type: "${targetType}"`,
      code: "FAVOURITE_TARGET_UNKNOWN",
    });
    this.name = "UnknownFavouriteTargetError";
  }
}

/**
 * A list name that collides, case-insensitively, with one the same person
 * already has.
 *
 * `favourite_list_user_name_uq` is what actually enforces this; the command
 * that creates or renames a list (Task 5) checks it first so the person reads
 * "you already have a list called that" instead of a raw constraint
 * violation.
 */
export class ListNameTakenError extends ConflictError {
  constructor(public readonly name: string) {
    super({
      message: `You already have a list called "${name}"`,
      code: "FAVOURITE_LIST_NAME_TAKEN",
    });
    this.name = "ListNameTakenError";
  }
}

/**
 * An attempt to remove the one list every person starts with.
 *
 * Renaming the default list is allowed — {@link FavouriteList.rename} does
 * not refuse it, and a list somebody named is theirs. Removing it is a
 * different act: it would leave a person with nowhere for a heart-tap to
 * land. `RemoveListCommand` (Task 5) throws this before the repository ever
 * sees the request; it is not a rule the aggregate itself can enforce because
 * the aggregate does not know it is the last one — that is a fact about the
 * repository's rows, not about this instance.
 */
export class DefaultListNotRemovableError extends ConflictError {
  constructor(public readonly listId: string) {
    super({
      message: "The default list cannot be removed",
      code: "FAVOURITE_LIST_DEFAULT_NOT_REMOVABLE",
    });
    this.name = "DefaultListNotRemovableError";
  }
}

/**
 * An action aimed at a list that belongs to somebody else.
 *
 * `ForbiddenError`, not `NotFoundError`: revealing that the id exists at all
 * is not the leak this guards against, but pretending the row is absent
 * would be its own kind of wrong answer once the caller is known to be
 * signed in. Thrown by Task 5's commands, which load the list by id and
 * compare its owner to the caller before doing anything else.
 */
export class ListNotYoursError extends ForbiddenError {
  constructor(public readonly listId: string) {
    super({
      message: "This list is not one you own",
      code: "FAVOURITE_LIST_NOT_YOURS",
    });
    this.name = "ListNotYoursError";
  }
}

/**
 * A cursor `entriesIn` could not decode.
 *
 * `UnprocessableError`, not `NotFoundError` or `ConflictError`: nothing is
 * missing and nothing conflicts — the value the caller sent is simply not one
 * this repository can use. The same shape of refusal as catalog's
 * `CategoryOrderInvalidError`.
 *
 * Defined here rather than imported from the activity or communication
 * context, each of which already has a class by this name: a bounded context
 * does not reach into another one's domain for an error type, and the `code`
 * differs per context precisely so a client can tell whose cursor went bad.
 * Task 7 hands GraphQL cursor input straight into `entriesIn`, so this is
 * client-facing — a mangled cursor must read as "your cursor is bad", not as
 * a generic 500.
 */
export class CursorInvalidError extends UnprocessableError {
  constructor(public readonly cursor: string) {
    super({
      message: `The requested cursor is not usable: "${cursor}"`,
      code: "FAVOURITE_CURSOR_INVALID",
    });
    this.name = "CursorInvalidError";
  }
}
