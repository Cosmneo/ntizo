import { describe, expect, it } from "vitest";
import {
  NotificationBucket,
  NotificationChannel,
  NotificationType,
  OPTIONAL_NOTIFICATION_CHANNELS,
  bucketForNotificationType,
  isMeteredChannel,
  isTransactionalNotificationType,
} from "../notification-enums";

const ALL_TYPES = Object.values(NotificationType);

describe("bucketForNotificationType", () => {
  it("classifies every type without falling through", () => {
    // The switch has no default. If a type is ever added to the enum and not
    // to the switch, TypeScript catches it at build time — this catches the
    // case where someone silences that by returning early.
    for (const type of ALL_TYPES) {
      const bucket = bucketForNotificationType(type);
      expect(bucket === null || Object.values(NotificationBucket).includes(bucket)).toBe(true);
    }
  });

  it("puts both sides' reminders in the same bucket", () => {
    // One switch, not two: a user who turns reminders off means it for the
    // reminders they receive, whichever role they were in.
    expect(bucketForNotificationType(NotificationType.BookingReminder24h)).toBe(
      NotificationBucket.Reminders,
    );
    expect(
      bucketForNotificationType(NotificationType.ProviderBookingReminder24h),
    ).toBe(NotificationBucket.Reminders);
  });
});

describe("isTransactionalNotificationType", () => {
  it("treats anything about money or account access as transactional", () => {
    // These are records of something that happened to the user's money or
    // their ability to sign in. Suppressing them because a marketing box was
    // unticked is how someone misses a charge.
    for (const type of [
      NotificationType.PaymentHeld,
      NotificationType.PaymentFailed,
      NotificationType.RefundIssued,
      NotificationType.ProviderPayoutSent,
      NotificationType.ProviderPayoutFailed,
      NotificationType.PasswordChanged,
      NotificationType.NewSignIn,
    ]) {
      expect(isTransactionalNotificationType(type)).toBe(true);
    }
  });

  it("treats marketing as switchable", () => {
    expect(isTransactionalNotificationType(NotificationType.Promotional)).toBe(false);
    expect(isTransactionalNotificationType(NotificationType.Newsletter)).toBe(false);
  });

  it("leaves most of the catalogue transactional", () => {
    // A sanity check on the shape of the set rather than a restatement of it:
    // if a refactor ever made the majority switchable, that is a decision, not
    // a detail, and it should fail here first.
    const switchable = ALL_TYPES.filter((t) => !isTransactionalNotificationType(t));
    expect(switchable.length).toBeLessThan(ALL_TYPES.length / 2);
  });
});

describe("notification channels", () => {
  it("never offers to switch off the in-app record", () => {
    // Without it a user has no history at all — they would open the bell,
    // find nothing, and conclude nothing happened.
    expect(OPTIONAL_NOTIFICATION_CHANNELS).not.toContain(NotificationChannel.InApp);
  });

  it("marks SMS as the one that costs per message", () => {
    expect(isMeteredChannel(NotificationChannel.Sms)).toBe(true);
    expect(isMeteredChannel(NotificationChannel.Email)).toBe(false);
    expect(isMeteredChannel(NotificationChannel.Push)).toBe(false);
  });

  it("offers only the channels the platform can actually deliver on", () => {
    // SMS was removed when delivery was decided to be email-only: there is no SMS
    // adapter in the repository at all, and a switch for a channel that cannot
    // send is a promise the settings page has no way to keep. The enum keeps
    // `Sms` — phone verification still needs the concept, and the metered rule is
    // right whenever it returns.
    expect(OPTIONAL_NOTIFICATION_CHANNELS).toEqual([
      NotificationChannel.Email,
      NotificationChannel.Push,
    ]);
  });

  it("still knows SMS is metered, for whenever it comes back", () => {
    expect(isMeteredChannel(NotificationChannel.Sms)).toBe(true);
  });
});
