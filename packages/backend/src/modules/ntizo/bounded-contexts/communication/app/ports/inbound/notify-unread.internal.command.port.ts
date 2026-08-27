export interface NotifyUnreadInternalInput {
  /** How many due messages one sweep may claim. The cron caller's budget, not this command's. */
  limit: number;
}

/**
 * The delayed notice: raises a notification for every message that is due,
 * still unread, and not yet notified — and only those. There is no GraphQL
 * mutation behind this and there must not be one: nobody asks for a sweep,
 * something schedules it.
 */
export interface NotifyUnreadInternalPort {
  execute(input: NotifyUnreadInternalInput): Promise<{ notified: number; failed: number }>;
}
