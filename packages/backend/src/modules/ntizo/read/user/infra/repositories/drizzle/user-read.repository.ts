import { eq } from "drizzle-orm";
import { toUserRole, type CurrentUserDTO, type UserRole } from "@ntizo/shared";
import { getDb } from "../../../../../../better-auth/infrastructure/client/drizzle";
import { user, profile } from "../../../../../shared/infrastructure/database/user/schemas";
import type { UserReadRepositoryPort } from "../../../app/ports/outbound/user-read.repository.port";

/**
 * Read-side repository. Projects straight to the read model — no aggregate
 * hydration. Reads ntizo's own user + profile tables, never better-auth's
 * user table (no cross-module reach).
 */
export class DrizzleUserReadRepository implements UserReadRepositoryPort {
  async findPlatformRole(userId: string): Promise<UserRole | null> {
    const [row] = await getDb()
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    // `role` is `text(...).$type<UserRole>()` — a cast, not a constraint, so
    // the column can hold anything. Narrow it here rather than trusting the
    // type, the same way the session path already does.
    return row ? toUserRole(row.role) : null;
  }

  async findCurrentUser(userId: string): Promise<CurrentUserDTO | null> {
    const [row] = await getDb()
      .select({
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        firstName: profile.firstName,
        lastName: profile.lastName,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        phoneNumber: profile.phoneNumber,
        bio: profile.bio,
        language: profile.language,
        timezone: profile.timezone,
      })
      .from(user)
      // leftJoin, not innerJoin: the profile is created empty on registration
      // and may legitimately not exist yet. innerJoin would make a fresh user
      // look deleted.
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(eq(user.id, userId))
      .limit(1);

    if (!row) return null;

    const firstName = row.firstName ?? "";
    const lastName = row.lastName ?? "";
    const displayName = row.displayName ?? `${firstName} ${lastName}`.trim();

    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      name: displayName,
      firstName,
      lastName,
      displayName,
      avatarUrl: row.avatarUrl ?? null,
      phoneNumber: row.phoneNumber ?? null,
      bio: row.bio ?? null,
      language: row.language ?? "en-US",
      timezone: row.timezone ?? "UTC",
    };
  }
}
