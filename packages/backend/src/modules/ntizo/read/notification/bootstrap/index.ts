import { DrizzleNotificationRepository } from "../../../bounded-contexts/notification/infrastructure/repositories/drizzle/notification.repository";
import { DrizzleProviderMemberReader } from "../../../bounded-contexts/notification/infrastructure/outbound-adapters/cross-bc/provider-member-reader.adapter";
import {
  CountUnreadProjection,
  ListMyNotificationsProjection,
  ListProviderNotificationsProjection,
} from "../app/use-cases/list-notifications.projection";

/**
 * The read tier imports the write tier's repository rather than owning a
 * duplicate — a deliberate ruling, not a coincidence. Precedent in this
 * codebase is mixed (`read/provider` keeps its own `infra/repositories`,
 * `read/catalog` imports from `bounded-contexts/catalog/infrastructure`), and
 * this followed catalog: the inbox read model is the same rows in the same
 * shape as the write side's, and a second class running identical SQL is two
 * places to fix one bug. "Fully independent" is what the read side is free to
 * become if its shape ever diverges, not an obligation to duplicate it today.
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
