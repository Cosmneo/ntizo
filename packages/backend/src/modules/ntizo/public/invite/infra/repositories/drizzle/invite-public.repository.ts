import { eq, sql } from "drizzle-orm";
import type { ProviderInvitePublicDTO } from "@ntizo/shared/read-models";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import {
  provider,
  providerInvite,
} from "../../../../../shared/infrastructure/database/provider/schemas";
import { user, profile } from "../../../../../shared/infrastructure/database/user/schemas";
import type { InvitePublicRepositoryPort } from "../../../app/ports/outbound/invite-public.repository.port";

/**
 * One row, joined to the workspace and the person who sent it.
 *
 * Selects columns explicitly rather than `select()`: this answers an
 * unauthenticated request, and a `SELECT *` here would ship every future
 * column on these tables to whoever holds a token. The list is the contract.
 *
 * The inviter's display name, falling back to their address — the email says
 * "Pedro invited you" and the page should not then say "someone did".
 */
export class DrizzleInvitePublicRepository implements InvitePublicRepositoryPort {
  async findByToken(token: string): Promise<ProviderInvitePublicDTO | null> {
    const [row] = await getDb()
      .select({
        providerName: provider.name,
        inviterName: profile.displayName,
        inviterEmail: user.email,
        role: providerInvite.role,
        email: providerInvite.email,
        status: providerInvite.status,
        expiresAt: providerInvite.expiresAt,
      })
      .from(providerInvite)
      .innerJoin(provider, eq(provider.id, providerInvite.providerId))
      // Joined on who *sent* it, not who owns the workspace: an admin can
      // invite, and naming the owner would credit the wrong person. Falls back
      // to the owner for rows written before that column existed.
      .leftJoin(
        user,
        eq(user.id, sql`coalesce(${providerInvite.invitedByUserId}, ${provider.ownerUserId})`),
      )
      .leftJoin(
        profile,
        eq(
          profile.userId,
          sql`coalesce(${providerInvite.invitedByUserId}, ${provider.ownerUserId})`,
        ),
      )
      .where(eq(providerInvite.token, token))
      .limit(1);

    if (!row) return null;

    // Expiry is computed here rather than trusted from the column: a row goes
    // to "expired" only when something touches it, so a stale "pending" is the
    // normal state of an invitation nobody has opened since it lapsed.
    const expired = row.expiresAt.getTime() < Date.now();

    return {
      providerName: row.providerName,
      // `|| `, not `??`: an unset display name is stored as "" rather than
      // null, so nullish-coalescing would hand the page an empty string and it
      // would say nobody invited them.
      inviterName: row.inviterName || row.inviterEmail || row.providerName,
      role: row.role as ProviderInvitePublicDTO["role"],
      email: row.email,
      status: expired && row.status === "pending" ? "expired" : row.status,
      expiresAt: row.expiresAt.toISOString(),
    };
  }
}
