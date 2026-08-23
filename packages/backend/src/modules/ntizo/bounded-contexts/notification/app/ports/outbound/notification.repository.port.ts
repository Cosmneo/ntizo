import type { Notification } from "../../../domain/aggregates/notification.aggregate";

/** One row as a projection returns it — already flattened, never an aggregate. */
export interface InboxRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  read: boolean;
}

export interface InboxPage {
  items: InboxRow[];
  total: number;
}

export interface NotificationRepositoryPort {
  /** Stores a new item and returns its assigned id. */
  save(entity: Notification): Promise<string>;

  /**
   * One page of a person's own inbox, newest first, with each row's read state
   * resolved for that same person.
   */
  listForUser(userId: string, limit: number, offset: number): Promise<InboxPage>;

  /**
   * One page of a workspace's inbox, newest first, with read state resolved for
   * `readerUserId` — the member asking, not the workspace.
   */
  listForProvider(
    providerId: string,
    readerUserId: string,
    limit: number,
    offset: number,
  ): Promise<InboxPage>;

  countUnreadForUser(userId: string): Promise<number>;
  countUnreadForProvider(providerId: string, readerUserId: string): Promise<number>;

  /**
   * Marks one item read by one reader. Returns false when the item does not
   * exist or is not addressed to this reader — the caller reports that rather
   * than confirming a no-op.
   */
  markRead(notificationId: string, readerUserId: string): Promise<boolean>;

  /** Marks every currently-unread item in this inbox read, for this reader only. */
  markAllReadForUser(userId: string): Promise<number>;
  markAllReadForProvider(providerId: string, readerUserId: string): Promise<number>;
}
