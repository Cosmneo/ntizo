import { ForbiddenError, NotFoundError } from "@cosmneo/onion-lasagna";

/**
 * A notification type the platform does not define.
 *
 * Worth its own error rather than a generic validation failure: this can only
 * happen when a handler was written against a type that was renamed or never
 * existed, and the message should say which string arrived so the handler is
 * findable.
 *
 * Stays a plain `Error`, unlike the two below: this is thrown only from
 * `raiseNotification`, an internal command no GraphQL resolver calls
 * directly, so there is no browser-facing masking behaviour for it to lose.
 */
export class UnknownNotificationTypeError extends Error {
  readonly code = "UNKNOWN_NOTIFICATION_TYPE";
  constructor(readonly type: string) {
    super(`"${type}" is not a notification type this platform defines`);
    this.name = "UnknownNotificationTypeError";
  }
}

/**
 * Nothing was marked.
 *
 * Raised for both a missing id and an item the caller is not entitled to,
 * deliberately identically: telling the two apart lets somebody probing ids
 * learn which notifications exist. The same rule the review commands follow.
 *
 * Extends the kit's `NotFoundError`, not plain `Error`: `getGraphQLErrorCode`
 * recognises kit error types and maps them to their coarse extension code,
 * masking everything else to `INTERNAL_ERROR`. Subclassing plain `Error` with
 * a bolted-on `code` field compiles and reads correctly, but this exact
 * mistake is why it reached the browser as "an unexpected error occurred"
 * instead of "not yours to mark" — do not "simplify" this back to `Error`.
 */
export class NotificationNotFoundError extends NotFoundError {
  constructor() {
    super({
      message: "No such notification, or it is not yours to mark",
      code: "NOTIFICATION_NOT_FOUND",
    });
    this.name = "NotificationNotFoundError";
  }
}

/**
 * Refused because the caller does not belong to this workspace.
 *
 * Extends the kit's `ForbiddenError` for the same reason as
 * {@link NotificationNotFoundError} above: a refusal the GraphQL layer
 * cannot recognise is masked to `INTERNAL_ERROR`, and a whole inbox refused
 * for that reason looks identical to a server crash. Do not "simplify" this
 * back to `Error`.
 */
export class NotProviderMemberError extends ForbiddenError {
  constructor(readonly providerId: string) {
    super({
      message: "You do not belong to this workspace",
      code: "NOT_PROVIDER_MEMBER",
    });
    this.name = "NotProviderMemberError";
  }
}
