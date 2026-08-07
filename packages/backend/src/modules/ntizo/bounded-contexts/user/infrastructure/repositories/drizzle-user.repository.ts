import { eq } from "drizzle-orm";
import type { UserRepositoryPort } from "../../app/ports/outbound";
import { User } from "../../domain/aggregates/user.aggregate";
import { user } from "../../../../shared/infrastructure/database/user";
import { getDb } from "../../../../../better-auth/infrastructure/client/drizzle";

export class DrizzleUserRepository implements UserRepositoryPort {
  async findById(id: string): Promise<User | null> {
    const db = getDb();
    const rows = await db.select().from(user).where(eq(user.id, id));
    const row = rows[0];
    if (!row) return null;
    return User.rehydrate({
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      verificationStatus: row.verificationStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    const db = getDb();
    const rows = await db.select().from(user).where(eq(user.email, email));
    const row = rows[0];
    if (!row) return null;
    return User.rehydrate({
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      verificationStatus: row.verificationStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async save(aggregate: User): Promise<void> {
    const db = getDb();
    const json = aggregate.toJSON();
    await db
      .insert(user)
      .values({
        id: json.id,
        email: json.email,
        role: json.role,
        status: json.status,
        verificationStatus: json.verificationStatus,
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
      })
      .onConflictDoUpdate({
        target: user.id,
        set: {
          email: json.email,
          role: json.role,
          status: json.status,
          verificationStatus: json.verificationStatus,
          updatedAt: json.updatedAt,
        },
      });
  }
}
