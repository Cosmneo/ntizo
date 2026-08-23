/**
 * A notification type the platform does not define.
 *
 * Worth its own error rather than a generic validation failure: this can only
 * happen when a handler was written against a type that was renamed or never
 * existed, and the message should say which string arrived so the handler is
 * findable.
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
 */
export class NotificationNotFoundError extends Error {
  readonly code = "NOTIFICATION_NOT_FOUND";
  constructor() {
    super("No such notification, or it is not yours to mark");
    this.name = "NotificationNotFoundError";
  }
}

export class NotProviderMemberError extends Error {
  readonly code = "NOT_PROVIDER_MEMBER";
  constructor(readonly providerId: string) {
    super("You do not belong to this workspace");
    this.name = "NotProviderMemberError";
  }
}
