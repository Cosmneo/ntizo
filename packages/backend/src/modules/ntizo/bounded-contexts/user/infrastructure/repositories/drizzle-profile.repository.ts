import { eq } from "drizzle-orm";
import type { ProfileRepositoryPort } from "../../app/ports/outbound";
import { Profile } from "../../domain/aggregates/profile.aggregate";
import { profile } from "../../../../shared/infrastructure/database/user";
import { getDb } from "../../../../../better-auth/infrastructure/client/drizzle";

export class DrizzleProfileRepository implements ProfileRepositoryPort {
  async findByUserId(userId: string): Promise<Profile | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(profile)
      .where(eq(profile.userId, userId));
    const row = rows[0];
    if (!row) return null;
    return Profile.rehydrate({
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      avatarKey: row.avatarKey,
      phoneNumber: row.phoneNumber,
      bio: row.bio,
      language: row.language,
      timezone: row.timezone,
      dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
      gender: row.gender,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async save(aggregate: Profile): Promise<void> {
    const db = getDb();
    const json = aggregate.toJSON();
    await db
      .insert(profile)
      .values({
        userId: json.userId,
        firstName: json.firstName,
        lastName: json.lastName,
        displayName: json.displayName,
        avatarUrl: json.avatarUrl,
        avatarKey: json.avatarKey,
        phoneNumber: json.phoneNumber,
        bio: json.bio,
        language: json.language,
        timezone: json.timezone,
        dateOfBirth: json.dateOfBirth
          ? json.dateOfBirth.toISOString().slice(0, 10)
          : null,
        gender: json.gender,
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
      })
      .onConflictDoUpdate({
        target: profile.userId,
        set: {
          firstName: json.firstName,
          lastName: json.lastName,
          displayName: json.displayName,
          avatarUrl: json.avatarUrl,
          avatarKey: json.avatarKey,
          phoneNumber: json.phoneNumber,
          bio: json.bio,
          language: json.language,
          timezone: json.timezone,
          dateOfBirth: json.dateOfBirth
            ? json.dateOfBirth.toISOString().slice(0, 10)
            : null,
          gender: json.gender,
          updatedAt: json.updatedAt,
        },
      });
  }
}
