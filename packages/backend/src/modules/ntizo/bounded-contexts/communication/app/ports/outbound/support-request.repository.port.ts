import type {
  SupportAudience,
  SupportStatus,
} from "../../../../../shared/infrastructure/database/communication/enums";
import type { SupportRequest } from "../../../domain/aggregates/support-request.aggregate";

/**
 * One row of the admin queue — the request joined to its thread, because
 * the queue orders by the thread's `last_message_at` and the request table
 * does not carry it. Names are resolved by the read tier, not here.
 */
export interface SupportRequestListItem {
  threadId: string;
  audience: SupportAudience;
  subject: string;
  status: SupportStatus;
  bookingId: string | null;
  /** The user who opened it — `thread.customer_user_id`. */
  requesterUserId: string;
  /** `thread.provider_id`: set for a provider request, null for a personal one. */
  providerId: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface SupportRequestPage {
  items: SupportRequestListItem[];
  nextCursor: string | null;
}

export interface SupportRequestFilter {
  status?: SupportStatus | undefined;
  audience?: SupportAudience | undefined;
}

export interface SupportRequestRepositoryPort {
  /** Called inside `OpenSupportRequestCommand`'s transaction, after the thread row exists. */
  insert(request: SupportRequest): Promise<void>;

  /** Null when no support request has this thread id — including when the id names an inquiry. */
  findByThreadId(threadId: string): Promise<SupportRequest | null>;

  /** Batched for a page of threads; a thread absent from the map is not a support request. */
  findByThreadIds(threadIds: string[]): Promise<Map<string, SupportRequest>>;

  /** Writes `status`, `resolved_at`, `resolved_by_user_id` from the aggregate handed in. */
  save(request: SupportRequest): Promise<void>;

  /**
   * How many open requests this requester has: for a personal request the
   * user's own (`provider_id IS NULL`); for a provider request the
   * provider's, whichever member opened them — the cap is shared, because
   * the requests are.
   */
  countOpenForRequester(customerUserId: string, providerId: string | null): Promise<number>;

  /** The admin queue, newest last-message first, cursor `<ISO>|<threadId>`. */
  listForAdmin(filter: SupportRequestFilter, limit: number, cursor: string | null): Promise<SupportRequestPage>;

  /** One queue row, or null when the id is not a support request. */
  findListItem(threadId: string): Promise<SupportRequestListItem | null>;

  /** Open requests across the platform — the admin nav badge. */
  countOpen(): Promise<number>;
}
