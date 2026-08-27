import type { Message } from "../../../domain/aggregates/message.aggregate";

/** One page of a conversation, newest first. */
export interface MessagePage {
  items: Message[];
  /** Pass back as `cursor` to get the next page. Null when there is no more. */
  nextCursor: string | null;
}

/**
 * A message the sweep must tell somebody about: due, still unread, not yet
 * notified. Carries just enough to raise the notification —
 * `RaiseNotificationInternalCommand` needs the recipient side (`providerId`
 * when the sender is the customer, `customerUserId` when the sender is a
 * provider member), not the body.
 */
export interface DueMessage {
  id: string;
  threadId: string;
  senderUserId: string;
  customerUserId: string;
  providerId: string;
}

export interface MessageRepositoryPort {
  /**
   * `message` already carries its `threadId` (from `Message.compose`), so it
   * is not a second argument here — passing it twice would let the two
   * disagree.
   */
  insert(message: Message): Promise<string>;

  /** One conversation, paged, newest first. */
  listForThread(threadId: string, limit: number, cursor: string | null): Promise<MessagePage>;

  /**
   * Marks read every unread message in this thread sent by the side
   * `viewerUserId` is *not* on — the customer's messages when a provider
   * member reads, the provider's when the customer reads. "Side" is resolved
   * against the thread's `customer_user_id`, not against `viewerUserId`
   * directly, so one teammate reading does not also mark another teammate's
   * own sent messages as read.
   *
   * Returns how many rows it actually marked.
   */
  markReadForViewer(threadId: string, viewerUserId: string, at: Date): Promise<number>;

  /**
   * Due, unread, not-yet-notified messages, oldest-due first, up to `limit`.
   * The sweep's input. A message already read, already notified, or not yet
   * due is never returned.
   */
  claimDueForNotice(limit: number, now: Date): Promise<DueMessage[]>;

  /**
   * Records that a notice was raised for this message. Called only after the
   * notice actually succeeded — Task 5's sweep must survive one bad row
   * without losing track of which ones it already handled, and a message
   * left unmarked here is simply retried by the next sweep.
   */
  markNotified(messageId: string, at: Date): Promise<void>;

  /**
   * How many unread messages from the other side sit in each of these
   * threads, for this viewer — one query for the whole page, not one per
   * thread. A thread with nothing unread is absent from the map rather than
   * present with `0`; callers read a missing entry as zero.
   */
  countUnreadForViewer(threadIds: string[], viewerUserId: string): Promise<Map<string, number>>;
}
