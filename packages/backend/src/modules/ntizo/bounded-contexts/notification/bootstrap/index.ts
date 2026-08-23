import { DrizzleNotificationRepository } from "../infrastructure/repositories/drizzle/notification.repository";
import { DrizzleProviderMemberReader } from "../infrastructure/outbound-adapters/cross-bc/provider-member-reader.adapter";
import { RaiseNotificationInternalCommand } from "../app/use-cases/raise-notification.internal.command";
import {
  MarkAllNotificationsReadCommand,
  MarkNotificationReadCommand,
} from "../app/use-cases/mark-read.command";

export function bootstrapNotification() {
  const notificationRepository = new DrizzleNotificationRepository();
  const memberReader = new DrizzleProviderMemberReader();

  return {
    adapters: { notificationRepository, memberReader },
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
