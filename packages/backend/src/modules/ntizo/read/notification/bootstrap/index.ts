import { DrizzleNotificationRepository } from "../../../bounded-contexts/notification/infrastructure/repositories/drizzle/notification.repository";
import { DrizzleProviderMemberReader } from "../../../bounded-contexts/notification/infrastructure/outbound-adapters/cross-bc/provider-member-reader.adapter";
import {
  CountUnreadProjection,
  ListMyNotificationsProjection,
  ListProviderNotificationsProjection,
} from "../app/use-cases/list-notifications.projection";

/**
 * The read tier bootstraps its own repository rather than sharing the write
 * tier's. That is the rule this architecture is built on: the read side is
 * fully independent, with its own adapters, so the two can diverge without
 * either noticing. They happen to be the same class today; that is a
 * coincidence, not a contract.
 */
export function bootstrapNotificationRead() {
  const repo = new DrizzleNotificationRepository();
  const members = new DrizzleProviderMemberReader();

  return {
    adapters: { repo, members },
    useCases: {
      listMine: new ListMyNotificationsProjection(repo),
      listForProvider: new ListProviderNotificationsProjection(repo, members),
      countUnread: new CountUnreadProjection(repo, members),
    },
  };
}

export type NotificationReadBootstrap = ReturnType<typeof bootstrapNotificationRead>;
