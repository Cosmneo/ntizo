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
