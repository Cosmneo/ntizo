/**
 * How a notification reaches someone.
 *
 * Separate from the type: the same booking confirmation goes out by email and
 * push, and a user may want reminders by SMS but nothing else — the settings
 * page is a grid of bucket × channel, not a single list of switches.
 */
export enum NotificationChannel {
  Email = "EMAIL",
  Sms = "SMS",
  Push = "PUSH",
  InApp = "IN_APP",
}

/**
 * Channels a user can switch off per bucket.
 *
 * `InApp` is missing on purpose. It costs nothing, it is where the bell in the
 * header reads from, and a user who silences it has no record of what
 * happened — they would find an empty list and conclude nothing did.
 *
 * `Sms` is missing because delivery was decided to be email-only, and there
 * is no SMS adapter anywhere in this repository — only
 * `ConsoleSmsServiceAdapter` — so no notification has ever left a machine by
 * SMS. A switch for a channel that cannot send is a promise the settings
 * page has no way to keep. The enum value and `isMeteredChannel` both stay:
 * phone verification still needs the concept (payment here is M-Pesa and
 * e-Mola, which are the phone), and the metered rule is right again the day
 * SMS delivery exists.
 */
export const OPTIONAL_NOTIFICATION_CHANNELS = [
  NotificationChannel.Email,
  NotificationChannel.Push,
] as const;

/**
 * SMS costs money per message, unlike the rest.
 *
 * Kept as a predicate rather than left implicit so the places that decide
 * whether to send — and the settings page, which should say so — read the
 * same rule instead of each hardcoding `=== Sms`.
 */
export function isMeteredChannel(channel: NotificationChannel): boolean {
  return channel === NotificationChannel.Sms;
}
