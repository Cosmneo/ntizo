import { and, asc, count, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import type {
  ProviderAdminDetailDTO,
  ProviderAdminDTO,
} from "@ntizo/shared/read-models";
import {
  PROVIDER_STATUS_TRANSITIONS,
  type ProviderStatus,
} from "@ntizo/shared";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  provider,
  providerDocument,
  providerInvite,
  providerMember,
} from "../../../../../shared/infrastructure/database/provider/schemas";
import {
  profile,
  user,
} from "../../../../../shared/infrastructure/database/user/schemas";
import { mediaUrl } from "../../../../../shared/infrastructure/media/media-url";
import { likePattern } from "../../../../../public/provider/infra/repositories/drizzle/provider-public.repository";
import type { ProviderAdminRepositoryPort } from "../../../app/ports/outbound/provider-read.repository.port";

/**
 * The platform-wide provider read, for the admin queue.
 *
 * Unlike the public repository, this one is allowed to see everything — that
 * is the whole point of the queue, and pending applications are exactly what
 * the public one must never return. The narrowing that matters here is who may
 * call it, and that lives at the GraphQL edge in `requireAdminUserId`.
 */
export class DrizzleProviderAdminRepository implements ProviderAdminRepositoryPort {
  async listAll(
    status: string | undefined,
    search: string | undefined,
    limit: number,
    offset: number,
  ): Promise<ProviderAdminDTO[]> {
    const filters: SQL[] = [];
    if (status) filters.push(eq(provider.status, status));
    if (search) {
      const pattern = likePattern(search);
      const match = or(
        ilike(provider.name, pattern),
        ilike(provider.slug, pattern),
        ilike(user.email, pattern),
      );
      if (match) filters.push(match);
    }

    const rows = await getDb()
      .select({
        id: provider.id,
        name: provider.name,
        slug: provider.slug,
        type: provider.type,
        status: provider.status,
        description: provider.description,
        city: provider.addressCity,
        country: provider.addressCountry,
        commissionBps: provider.commissionBps,
        ownerEmail: user.email,
        createdAt: provider.createdAt,
      })
      .from(provider)
      // Left, not inner: an owner row that went missing must not delete the
      // provider from the queue. A business with no visible owner is a thing
      // an admin needs to see, not a thing that should disappear.
      .leftJoin(user, eq(user.id, provider.ownerUserId))
      .where(filters.length ? and(...filters) : undefined)
      // Newest first: the queue is worked from the top, and the thing that
      // just arrived is the thing nobody has looked at.
      .orderBy(desc(provider.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => ({
      ...row,
      type: row.type as ProviderAdminDTO["type"],
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async findDetailForAdmin(
    providerId: string,
  ): Promise<ProviderAdminDetailDTO | null> {
    const [row] = await getDb()
      .select({
        id: provider.id,
        name: provider.name,
        slug: provider.slug,
        type: provider.type,
        status: provider.status,
        description: provider.description,
        city: provider.addressCity,
        country: provider.addressCountry,
        ownerPhone: profile.phoneNumber,
        commissionBps: provider.commissionBps,
        ownerUserId: provider.ownerUserId,
        ownerName: profile.displayName,
        ownerEmail: user.email,
        logoKey: provider.logoKey,
        photoKeys: provider.photoKeys,
        addressStreet: provider.addressStreet,
        addressDistrict: provider.addressDistrict,
        addressPostalCode: provider.addressPostalCode,
        reverificationRequestedAt: provider.reverificationRequestedAt,
        createdAt: provider.createdAt,
        updatedAt: provider.updatedAt,
        // Counted in the query: a detail screen that fires one more round trip
        // per number on it is a screen that gets slower as it gets useful.
        memberCount: sql<number>`(
          select count(*)::int from ${providerMember}
          where ${providerMember.providerId} = ${provider.id}
        )`,
      })
      .from(provider)
      .leftJoin(user, eq(user.id, provider.ownerUserId))
      .leftJoin(profile, eq(profile.userId, provider.ownerUserId))
      .where(eq(provider.id, providerId))
      .limit(1);

    if (!row) return null;

    // A second query rather than a join: one provider has several documents,
    // and joining would multiply the row above by them and make every count on
    // it wrong.
    const documents = await getDb()
      .select({
        id: providerDocument.id,
        type: providerDocument.type,
        status: providerDocument.status,
        fileName: providerDocument.fileName,
        contentType: providerDocument.contentType,
        uploadedAt: providerDocument.uploadedAt,
        reviewedAt: providerDocument.reviewedAt,
        rejectionReason: providerDocument.rejectionReason,
        supersedesId: providerDocument.supersedesId,
      })
      .from(providerDocument)
      .where(eq(providerDocument.providerId, providerId))
      .orderBy(desc(providerDocument.uploadedAt));

    // Three small reads rather than three joins onto the row above: joining
    // any one of them multiplies it and makes every count on it wrong.
    const [members, invites] = await Promise.all([
      getDb()
        .select({
          userId: providerMember.userId,
          role: providerMember.role,
          joinedAt: providerMember.joinedAt,
          email: user.email,
          name: profile.displayName,
        })
        .from(providerMember)
        .leftJoin(user, eq(user.id, providerMember.userId))
        .leftJoin(profile, eq(profile.userId, providerMember.userId))
        .where(eq(providerMember.providerId, providerId))
        .orderBy(asc(providerMember.joinedAt)),
      getDb()
        .select({
          id: providerInvite.id,
          email: providerInvite.email,
          role: providerInvite.role,
          status: providerInvite.status,
          expiresAt: providerInvite.expiresAt,
          createdAt: providerInvite.createdAt,
        })
        .from(providerInvite)
        // Revoked invitations are nobody's business on this screen: they were
        // withdrawn, and listing them would read as access that exists.
        .where(
          and(
            eq(providerInvite.providerId, providerId),
            ne(providerInvite.status, "revoked"),
          ),
        )
        .orderBy(desc(providerInvite.createdAt)),
    ]);

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type,
      status: row.status,
      description: row.description,
      city: row.city,
      country: row.country,
      commissionBps: row.commissionBps,
      ownerUserId: row.ownerUserId,
      // Empty is not a name: the column defaults to "" rather than null, so
      // `?? null` alone would hand the screen a blank where it expects an
      // absence and would print nothing instead of the email beside it.
      ownerName: row.ownerName?.trim() ? row.ownerName : null,
      ownerEmail: row.ownerEmail,
      ownerPhone: row.ownerPhone?.trim() ? row.ownerPhone : null,
      memberCount: row.memberCount,
      members: members.map((m) => ({
        userId: m.userId,
        email: m.email,
        // Empty is not a name: the column defaults to "" rather than null.
        name: m.name?.trim() ? m.name : null,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
      invites: invites.map((i) => ({
        ...i,
        expiresAt: i.expiresAt.toISOString(),
        createdAt: i.createdAt.toISOString(),
      })),
      logoUrl: row.logoKey ? mediaUrl(row.logoKey) : null,
      // Filtered after mapping, not before: `mediaUrl` returns null where
      // nothing serves the bucket, and a photo with no URL is a photo this
      // screen cannot show rather than a photo that is not there.
      photoUrls: (row.photoKeys ?? [])
        .map((k) => mediaUrl(k))
        .filter((u): u is string => u !== null),
      addressStreet: row.addressStreet,
      addressDistrict: row.addressDistrict,
      addressPostalCode: row.addressPostalCode,
      documents: documents.map((doc) => ({
        ...doc,
        uploadedAt: doc.uploadedAt.toISOString(),
        reviewedAt: doc.reviewedAt?.toISOString() ?? null,
      })),
      reverificationRequestedAt:
        row.reverificationRequestedAt?.toISOString() ?? null,
      // Resolved here so the screen and the aggregate cannot disagree about
      // what may be offered. A button the server then refuses is worse than
      // no button.
      allowedTransitions: [
        ...(PROVIDER_STATUS_TRANSITIONS[row.status as ProviderStatus] ?? []),
      ],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await getDb()
      .select({ status: provider.status, n: count() })
      .from(provider)
      .groupBy(provider.status);
    // A status with no providers is absent from the result, not zero. The
    // caller fills the gaps — the tab has to render either way.
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }
}
