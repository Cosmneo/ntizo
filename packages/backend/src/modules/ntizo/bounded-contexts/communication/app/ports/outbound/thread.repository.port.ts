import type { ThreadRow } from "../../../../../shared/infrastructure/database/communication/schemas";
import type { Thread } from "../../../domain/aggregates/thread.aggregate";

/** What `openOrFind` reports about the write it just made. */
export interface ThreadOpenResult {
  id: string;
  /** True only when this call is the one that inserted the row. */
  created: boolean;
}

/** One page of somebody's conversations, newest last-message first. */
export interface ThreadPage {
  items: Thread[];
  /** Pass back as `cursor` to get the next page. Null when there is no more. */
  nextCursor: string | null;
}

export interface ThreadRepositoryPort {
  /**
   * Finds the thread for this `(customer, provider)` pair, or opens one.
   *
   * An upsert against `thread_customer_provider_uq`, not a read followed by a
   * conditional insert: two messages sent at the same instant must resolve to
   * the same thread, and a decision made from a read taken before the write
   * is a decision made from a fact that can already be stale by the time the
   * write happens. `created` reports what *this* statement did — insert or
   * update — not what some earlier read happened to see.
   */
  openOrFind(customerUserId: string, providerId: string, now: Date): Promise<ThreadOpenResult>;

  /** Moves `last_message_at` forward. Called in the same transaction as the message that caused it. */
  touch(threadId: string, at: Date): Promise<void>;

  /**
   * The thread, only if `viewerUserId` may see it — the customer on it, or a
   * member of its provider. Null both when the thread does not exist and when
   * it exists but is not this viewer's: telling those apart would tell a
   * caller probing thread ids which ones are real.
   *
   * Returns the raw row rather than a rehydrated `Thread`: this is a
   * visibility check other operations gate on, not a page being rendered.
   */
  findVisible(threadId: string, viewerUserId: string): Promise<ThreadRow | null>;

  /** The customer's inbox: threads where they are the customer, newest last-message first. */
  listForCustomer(customerUserId: string, limit: number, cursor: string | null): Promise<ThreadPage>;

  /** One provider's inbox: threads on that provider, newest last-message first. */
  listForProvider(providerId: string, limit: number, cursor: string | null): Promise<ThreadPage>;
}
