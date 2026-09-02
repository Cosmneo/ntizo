import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { contactReferenceOf, type ContactRequestKind, type ContactRequestStatus, type ContactTopic } from "@ntizo/shared";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { contactRequest } from "../../../../../shared/infrastructure/database/contact/schemas";
import { ContactRequest } from "../../../domain/aggregates/contact-request.aggregate";
import type {
  ContactRequestAdminPage,
  ContactRequestListInput,
  ContactRequestRepositoryPort,
} from "../../../app/ports/outbound/contact-request.repository.port";

type Row = typeof contactRequest.$inferSelect;

function toAggregate(row: Row): ContactRequest {
  return ContactRequest.reconstitute({
    id: row.id,
    kind: row.kind as ContactRequestKind,
    topic: row.topic as ContactTopic,
    name: row.name,
    email: row.email,
    message: row.message,
    requesterUserId: row.requesterUserId,
    locale: row.locale,
    originPath: row.originPath,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    status: row.status as ContactRequestStatus,
    resolvedAt: row.resolvedAt,
    resolvedByUserId: row.resolvedByUserId,
    createdAt: row.createdAt,
  });
}

export class DrizzleContactRequestRepository implements ContactRequestRepositoryPort {
  async insert(entity: ContactRequest): Promise<ContactRequest> {
    const [row] = await getDb()
      .insert(contactRequest)
      .values({
        kind: entity.kind,
        topic: entity.topic,
        name: entity.name,
        email: entity.email,
        message: entity.message,
        requesterUserId: entity.requesterUserId,
        locale: entity.locale,
        originPath: entity.originPath,
        ipAddress: entity.ipAddress,
        userAgent: entity.userAgent,
        status: entity.status,
      })
      .returning({ id: contactRequest.id, createdAt: contactRequest.createdAt });
    return entity.withId(row!.id, row!.createdAt);
  }

  async findById(id: string): Promise<ContactRequest | null> {
    const [row] = await getDb().select().from(contactRequest).where(eq(contactRequest.id, id)).limit(1);
    return row ? toAggregate(row) : null;
  }

  async saveStatus(entity: ContactRequest): Promise<boolean> {
    if (!entity.id) return false;
    const rows = await getDb()
      .update(contactRequest)
      .set({
        status: entity.status,
        resolvedAt: entity.resolvedAt,
        resolvedByUserId: entity.resolvedByUserId,
      })
      .where(eq(contactRequest.id, entity.id))
      .returning({ id: contactRequest.id });
    return rows.length > 0;
  }

  async countFromIpSince(ipAddress: string, since: Date): Promise<number> {
    const [row] = await getDb()
      .select({ n: count() })
      .from(contactRequest)
      .where(and(eq(contactRequest.ipAddress, ipAddress), gte(contactRequest.createdAt, since)));
    return row?.n ?? 0;
  }

  /**
   * The queue, as the administrator works it.
   *
   * The search covers the four things somebody would type: a name, an email,
   * a phrase from the message, and the reference a person quoted back —
   * which is the id's leading hex characters, so `id::text ILIKE 'ref%'`
   * finds it without stripping hyphens (see `contactReferenceOf`).
   *
   * `openCount` is counted over the whole table, unfiltered: it is the number
   * beside the queue's name, and must not change when somebody searches.
   */
  async listForAdmin(input: ContactRequestListInput): Promise<ContactRequestAdminPage> {
    const db = getDb();
    const term = input.search?.trim();
    const matches = term
      ? or(
          ilike(contactRequest.name, `%${term}%`),
          ilike(contactRequest.email, `%${term}%`),
          ilike(contactRequest.message, `%${term}%`),
          ilike(sql`${contactRequest.id}::text`, `${term}%`),
        )
      : undefined;
    const filter = and(
      input.kind ? eq(contactRequest.kind, input.kind) : undefined,
      input.status ? eq(contactRequest.status, input.status) : undefined,
      matches,
    );

    const [rows, [totals], [open]] = await Promise.all([
      db
        .select()
        .from(contactRequest)
        .where(filter)
        .orderBy(desc(contactRequest.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      db.select({ n: count() }).from(contactRequest).where(filter),
      db.select({ n: count() }).from(contactRequest).where(eq(contactRequest.status, "open")),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        reference: contactReferenceOf(r.id),
        kind: r.kind as ContactRequestKind,
        topic: r.topic as ContactTopic,
        name: r.name,
        email: r.email,
        message: r.message,
        requesterUserId: r.requesterUserId,
        locale: r.locale,
        originPath: r.originPath,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        status: r.status as ContactRequestStatus,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      total: totals?.n ?? 0,
      openCount: open?.n ?? 0,
    };
  }
}
