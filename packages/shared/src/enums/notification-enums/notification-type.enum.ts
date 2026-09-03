/**
 * Every notification the platform can send.
 *
 * One list, both sides: a notification is raised by the backend and its
 * preference is toggled in the profile, so a type that exists in one and not
 * the other is a notification nobody can turn off — or a switch that controls
 * nothing.
 *
 * Names carry the audience where it is ambiguous. A booking cancellation
 * reaches both parties but says different things to each, so it is two types
 * (`BookingCancelledByProvider`, `ProviderBookingCancelledByCustomer`) rather
 * than one type with a branch in the template.
 */
export enum NotificationType {
  // --- account -----------------------------------------------------------
  Welcome = "WELCOME",
  PhoneVerified = "PHONE_VERIFIED",
  PasswordChanged = "PASSWORD_CHANGED",
  NewSignIn = "NEW_SIGN_IN",

  // --- booking, customer side -------------------------------------------
  BookingRequested = "BOOKING_REQUESTED",
  /** The provider said yes; the payment prompt is on its way to the customer's handset. Not yet confirmed. */
  BookingAccepted = "BOOKING_ACCEPTED",
  BookingConfirmed = "BOOKING_CONFIRMED",
  BookingDeclined = "BOOKING_DECLINED",
  BookingReminder24h = "BOOKING_REMINDER_24H",
  BookingCancelledByProvider = "BOOKING_CANCELLED_BY_PROVIDER",
  BookingCompleted = "BOOKING_COMPLETED",
  ReviewRequest = "REVIEW_REQUEST",

  // --- booking, provider side -------------------------------------------
  ProviderBookingReceived = "PROVIDER_BOOKING_RECEIVED",
  /** The customer paid — the booking the provider accepted is now a commitment on both sides. */
  ProviderBookingConfirmed = "PROVIDER_BOOKING_CONFIRMED",
  ProviderBookingReminder24h = "PROVIDER_BOOKING_REMINDER_24H",
  ProviderBookingCancelledByCustomer = "PROVIDER_BOOKING_CANCELLED_BY_CUSTOMER",
  ProviderReviewReceived = "PROVIDER_REVIEW_RECEIVED",

  // --- quotes ------------------------------------------------------------
  QuoteReceived = "QUOTE_RECEIVED",
  QuoteExpired = "QUOTE_EXPIRED",
  ProviderQuoteRequested = "PROVIDER_QUOTE_REQUESTED",
  ProviderQuoteAccepted = "PROVIDER_QUOTE_ACCEPTED",
  ProviderQuoteDeclined = "PROVIDER_QUOTE_DECLINED",

  // --- money -------------------------------------------------------------
  PaymentHeld = "PAYMENT_HELD",
  PaymentFailed = "PAYMENT_FAILED",
  RefundIssued = "REFUND_ISSUED",
  ProviderPaymentReleased = "PROVIDER_PAYMENT_RELEASED",
  ProviderPayoutSent = "PROVIDER_PAYOUT_SENT",
  ProviderPayoutFailed = "PROVIDER_PAYOUT_FAILED",

  // --- workspace ---------------------------------------------------------
  ProviderWorkspaceWelcome = "PROVIDER_WORKSPACE_WELCOME",
  ProviderDocumentsRequired = "PROVIDER_DOCUMENTS_REQUIRED",
  ProviderVerified = "PROVIDER_VERIFIED",
  TeamInvitation = "TEAM_INVITATION",

  // --- messages ----------------------------------------------------------
  NewMessage = "NEW_MESSAGE",

  // --- support -----------------------------------------------------------
  /** To every admin: somebody opened a request. */
  SupportRequestOpened = "SUPPORT_REQUEST_OPENED",
  /** To every admin: the requester wrote again and nobody read it in time. */
  SupportRequestMessage = "SUPPORT_REQUEST_MESSAGE",
  /** To the requester side: the platform answered and it sat unread. */
  SupportReply = "SUPPORT_REPLY",
  /** To the requester side: an admin marked the request resolved. */
  SupportRequestResolved = "SUPPORT_REQUEST_RESOLVED",

  // --- marketing ---------------------------------------------------------
  Promotional = "PROMOTIONAL",
  Newsletter = "NEWSLETTER",
}

/**
 * The buckets a user can switch off in their notification settings.
 *
 * Deliberately fewer than there are types: a settings page with thirty
 * switches is one nobody reads. Anything not in a bucket is transactional and
 * has no switch at all.
 */
export enum NotificationBucket {
  Reminders = "REMINDERS",
  Reviews = "REVIEWS",
  Promotional = "PROMOTIONAL",
  Newsletter = "NEWSLETTER",
}

/**
 * Whether a notification is part of a transaction the user is already in.
 *
 * This is not a UX preference. A booking confirmation, a refund, a failed
 * payment and a new sign-in are records of something that happened to the
 * user's money or account, and suppressing them because someone unticked a
 * marketing box is how people miss a charge. Transactional types are sent
 * regardless of preferences, and the settings page must not offer to disable
 * them.
 */
export function isTransactionalNotificationType(
  type: NotificationType,
): boolean {
  return bucketForNotificationType(type) === null;
}

/**
 * The bucket a type belongs to, or `null` when it is transactional.
 *
 * A `switch` with every case spelled out rather than a lookup with a default:
 * adding a type to the enum then fails to compile here until someone decides
 * whether it can be switched off. A default would silently make every new
 * notification transactional — the safe-looking answer that also means
 * unswitchable.
 */
export function bucketForNotificationType(
  type: NotificationType,
): NotificationBucket | null {
  switch (type) {
    case NotificationType.BookingReminder24h:
    case NotificationType.ProviderBookingReminder24h:
      return NotificationBucket.Reminders;

    case NotificationType.ReviewRequest:
      return NotificationBucket.Reviews;

    case NotificationType.Promotional:
      return NotificationBucket.Promotional;

    case NotificationType.Newsletter:
      return NotificationBucket.Newsletter;

    case NotificationType.Welcome:
    case NotificationType.PhoneVerified:
    case NotificationType.PasswordChanged:
    case NotificationType.NewSignIn:
    case NotificationType.BookingRequested:
    case NotificationType.BookingAccepted:
    case NotificationType.BookingConfirmed:
    case NotificationType.BookingDeclined:
    case NotificationType.BookingCancelledByProvider:
    case NotificationType.BookingCompleted:
    case NotificationType.ProviderBookingReceived:
    case NotificationType.ProviderBookingConfirmed:
    case NotificationType.ProviderBookingCancelledByCustomer:
    case NotificationType.ProviderReviewReceived:
    case NotificationType.QuoteReceived:
    case NotificationType.QuoteExpired:
    case NotificationType.ProviderQuoteRequested:
    case NotificationType.ProviderQuoteAccepted:
    case NotificationType.ProviderQuoteDeclined:
    case NotificationType.PaymentHeld:
    case NotificationType.PaymentFailed:
    case NotificationType.RefundIssued:
    case NotificationType.ProviderPaymentReleased:
    case NotificationType.ProviderPayoutSent:
    case NotificationType.ProviderPayoutFailed:
    case NotificationType.ProviderWorkspaceWelcome:
    case NotificationType.ProviderDocumentsRequired:
    case NotificationType.ProviderVerified:
    case NotificationType.TeamInvitation:
    case NotificationType.NewMessage:
    case NotificationType.SupportRequestOpened:
    case NotificationType.SupportRequestMessage:
    case NotificationType.SupportReply:
    case NotificationType.SupportRequestResolved:
      return null;
  }
}
