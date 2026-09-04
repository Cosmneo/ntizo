import { and, count, desc, eq, inArray, isNull, lt, or, type SQL } from "drizzle-orm";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { supportRequest, thread } from "../../../../../shared/infrastructure/database/communication/schemas";
import { SupportRequest } from "../../../domain/aggregates/support-request.aggregate";
import { CursorInvalidError } from "../../../domain/exceptions";
import type {
  SupportRequestFilter,
  SupportRequestListItem,
  SupportRequestPage,
  SupportRequestRepositoryPort,
} from "../../../app/ports/outbound/support-request.repository.port";

/** `<lastMessageAt ISO>|<threadId>` — the same shape and the same tie-break argument as `thread.repository.ts`. */
function encodeCursor(lastMessageAt: Date, threadId: string): string {
  return `${lastMessageAt.toISOString()}|${threadId}`;
}

function decodeCursor(cursor: string): { lastMessageAt: Date; threadId: string } | null {
  const [when, threadId] = cursor.split("|");
  if (!when || !threadId) return null;
  const lastMessageAt = new Date(when);
  return Number.isNaN(lastMessageAt.getTime()) ? null : { lastMessageAt, threadId };
}

const listColumns = {
  threadId: supportRequest.threadId,
  audience: supportRequest.audience,
  subject: supportRequest.subject,
  status: supportRequest.status,
  bookingId: supportRequest.bookingId,
  requesterUserId: thread.customerUserId,
  providerId: thread.providerId,
  lastMessageAt: thread.lastMessageAt,
  createdAt: supportRequest.createdAt,
  resolvedAt: supportRequest.resolvedAt,
};

type ListRow = {
  [K in keyof typeof listColumns]: (typeof listColumns)[K]["_"]["data"] | null;
};

function toListItem(r: ListRow): SupportRequestListItem {
  return {
    threadId: r.threadId!,
    audience: r.audience as SupportRequestListItem["audience"],
    subject: r.subject!,
    status: r.status as SupportRequestListItem["status"],
    bookingId: r.bookingId,
    requesterUserId: r.requesterUserId!,
    providerId: r.providerId,
    lastMessageAt: r.lastMessageAt!,
    createdAt: r.createdAt!,
    resolvedAt: r.resolvedAt,
  };
}

/**
 * Scoped to support requests by construction, not by convention: an inquiry
 * has no `support_request` row at all, so every read of this table — joined
 * with `thread` or not — can only ever see support requests. `findByThreadId`
 * and `countOpen` read `support_request` alone and are just as scoped as the
 * joined reads below; the joins in `countOpenForRequester`, `listForAdmin`
 * and `findListItem` exist to order by `thread.last_message_at` and to pull
 * the thread's `customer_user_id` / `provider_id` columns into the result,
 * not to keep the admin slices away from private conversations — that
 * guarantee needs no join at all.
 */
export class DrizzleSupportRequestRepository implements SupportRequestRepositoryPort {
  async insert(request: SupportRequest): Promise<void> {
    await getDb().insert(supportRequest).values({
      threadId: request.threadId,
      audience: request.audience,
      subject: request.subject,
      bookingId: request.bookingId,
      kind: request.kind,
      status: request.status,
      resolvedAt: request.resolvedAt,
      resolvedByUserId: request.resolvedByUserId,
      createdAt: request.createdAt,
    });
  }

  async findByThreadId(threadId: string): Promise<SupportRequest | null> {
    const byId = await this.findByThreadIds([threadId]);
    return byId.get(threadId) ?? null;
  }

  async findByThreadIds(threadIds: string[]): Promise<Map<string, SupportRequest>> {
    if (threadIds.length === 0) return new Map();
    const rows = await getDb().select().from(supportRequest).where(inArray(supportRequest.threadId, threadIds));
    return new Map(
      rows.map((r) => [
        r.threadId,
        // `rehydrate`, never `open`: a stored subject was valid under the rule in force when it was written.
        SupportRequest.rehydrate({
          threadId: r.threadId,
          audience: r.audience as SupportRequest["audience"],
          subject: r.subject,
          bookingId: r.bookingId,
          // Cast for the same reason `audience` and `status` are cast: the
          // column is a `varchar` with a CHECK behind it, not a Postgres
          // enum, so Drizzle types it as a bare `string`. The database is
          // what guarantees the value is one of the two — see
          // `support_request_kind_known`.
          kind: r.kind as SupportRequest["kind"],
          status: r.status as SupportRequest["status"],
          resolvedAt: r.resolvedAt,
          resolvedByUserId: r.resolvedByUserId,
          createdAt: r.createdAt,
        }),
      ]),
    );
  }

  async save(request: SupportRequest): Promise<void> {
    await getDb()
      .update(supportRequest)
      .set({
        status: request.status,
        resolvedAt: request.resolvedAt,
        resolvedByUserId: request.resolvedByUserId,
      })
      .where(eq(supportRequest.threadId, request.threadId));
  }

  async countOpenForRequester(customerUserId: string, providerId: string | null): Promise<number> {
    const scope =
      providerId === null
        ? and(eq(thread.customerUserId, customerUserId), isNull(thread.providerId))
        : eq(thread.providerId, providerId);
    const [row] = await getDb()
      .select({ value: count() })
      .from(supportRequest)
      .innerJoin(thread, eq(thread.id, supportRequest.threadId))
      .where(and(eq(supportRequest.status, "open"), scope));
    return row?.value ?? 0;
  }

  async listForAdmin(filter: SupportRequestFilter, limit: number, cursor: string | null): Promise<SupportRequestPage> {
    let after: { lastMessageAt: Date; threadId: string } | null = null;
    if (cursor) {
      after = decodeCursor(cursor);
      if (!after) throw new CursorInvalidError(cursor);
    }

    const conditions: (SQL | undefined)[] = [
      filter.status ? eq(supportRequest.status, filter.status) : undefined,
      filter.audience ? eq(supportRequest.audience, filter.audience) : undefined,
      after
        ? or(
            lt(thread.lastMessageAt, after.lastMessageAt),
            and(eq(thread.lastMessageAt, after.lastMessageAt), lt(thread.id, after.threadId)),
          )
        : undefined,
    ];

    // One more than asked for — its existence is what says another page exists.
    const rows = await getDb()
      .select(listColumns)
      .from(supportRequest)
      .innerJoin(thread, eq(thread.id, supportRequest.threadId))
      .where(and(...conditions))
      .orderBy(desc(thread.lastMessageAt), desc(thread.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(toListItem),
      nextCursor: hasMore && last ? encodeCursor(last.lastMessageAt, last.threadId) : null,
    };
  }

  async findListItem(threadId: string): Promise<SupportRequestListItem | null> {
    const [row] = await getDb()
      .select(listColumns)
      .from(supportRequest)
      .innerJoin(thread, eq(thread.id, supportRequest.threadId))
      .where(eq(supportRequest.threadId, threadId))
      .limit(1);
    return row ? toListItem(row) : null;
  }

  async countOpen(): Promise<number> {
    const [row] = await getDb()
      .select({ value: count() })
      .from(supportRequest)
      .where(eq(supportRequest.status, "open"));
    return row?.value ?? 0;
  }
}
