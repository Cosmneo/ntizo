import { describe, expect, it } from "bun:test";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { CreateUserOnSignUpInternalCommand } from "../create-user-on-sign-up.internal.command";
import type {
  ProfileRepositoryPort,
  UserRepositoryPort,
} from "../../ports/outbound";
import { User } from "../../../domain/aggregates/user.aggregate";
import { Profile } from "../../../domain/aggregates/profile.aggregate";

/**
 * In-memory store shared by the fake repositories below, plus a UoW double
 * that models Postgres rollback: `atomicExecute` snapshots the store before
 * running the work and restores it if the work throws. Both aggregates are
 * created fresh and never mutated in place before the failure point in this
 * flow, so a shallow copy of each Map is a sufficient point-in-time snapshot.
 */
interface Store {
  users: Map<string, User>;
  profiles: Map<string, Profile>;
}

function createStore(): Store {
  return { users: new Map(), profiles: new Map() };
}

class InMemoryUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly store: Store) {}

  async atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    const snapshot: Store = {
      users: new Map(this.store.users),
      profiles: new Map(this.store.profiles),
    };
    try {
      return await work();
    } catch (e) {
      this.store.users = snapshot.users;
      this.store.profiles = snapshot.profiles;
      throw e;
    }
  }
}

class FakeUserRepository implements UserRepositoryPort {
  constructor(private readonly store: Store) {}
  async findById(id: string): Promise<User | null> {
    return this.store.users.get(id) ?? null;
  }
  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.store.users.values()) {
      if (user.email === email) return user;
    }
    return null;
  }
  async save(user: User): Promise<void> {
    this.store.users.set(user.id, user);
  }
}

class FakeProfileRepository implements ProfileRepositoryPort {
  constructor(private readonly store: Store) {}
  async findByUserId(userId: string): Promise<Profile | null> {
    return this.store.profiles.get(userId) ?? null;
  }
  async save(_profile: Profile): Promise<void> {
    throw new Error("profileRepo.save always rejects in this test");
  }
}

describe("CreateUserOnSignUpInternalCommand — atomicity", () => {
  it("rolls back the user write when the profile write fails, leaving no orphan user row", async () => {
    const store = createStore();
    const userRepo = new FakeUserRepository(store);
    const profileRepo = new FakeProfileRepository(store);
    const unitOfWork = new InMemoryUnitOfWork(store);

    const command = new CreateUserOnSignUpInternalCommand(
      userRepo,
      profileRepo,
      unitOfWork,
    );

    await expect(
      command.execute({
        userId: "user-1",
        email: "new@ntizo.test",
        firstName: "New",
        lastName: "User",
      }),
    ).rejects.toThrow("profileRepo.save always rejects in this test");

    // The bug: today the user row survives even though the profile write
    // failed, leaving an authenticatable user with no ntizo_user profile.
    expect(await userRepo.findById("user-1")).toBeNull();
    expect(store.users.size).toBe(0);
    expect(store.profiles.size).toBe(0);
  });
});
