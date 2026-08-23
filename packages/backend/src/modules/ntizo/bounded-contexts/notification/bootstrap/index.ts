import { DrizzleNotificationRepository } from "../infrastructure/repositories/drizzle/notification.repository";
import { DrizzleProviderMemberReader } from "../infrastructure/outbound-adapters/cross-bc/provider-member-reader.adapter";
import { DrizzleProviderNameReader } from "../infrastructure/outbound-adapters/cross-bc/provider-name-reader.adapter";
import { DrizzleUserByEmailReader } from "../infrastructure/outbound-adapters/cross-bc/user-by-email-reader.adapter";
import { RaiseNotificationInternalCommand } from "../app/use-cases/raise-notification.internal.command";
import {
  MarkAllNotificationsReadCommand,
  MarkNotificationReadCommand,
} from "../app/use-cases/mark-read.command";

export function bootstrapNotification() {
  const notificationRepository = new DrizzleNotificationRepository();
  const memberReader = new DrizzleProviderMemberReader();
  const userByEmailReader = new DrizzleUserByEmailReader();
  const providerNameReader = new DrizzleProviderNameReader();

  return {
    adapters: { notificationRepository, memberReader, userByEmailReader, providerNameReader },
    useCases: {
      markNotificationRead: new MarkNotificationReadCommand(notificationRepository),
      markAllNotificationsRead: new MarkAllNotificationsReadCommand(
        notificationRepository,
        memberReader,
      ),
      internal: {
        raiseNotification: new RaiseNotificationInternalCommand(notificationRepository),
      },
    },
  };
}

export type NotificationBootstrap = ReturnType<typeof bootstrapNotification>;
