import { describe, expect, it } from "bun:test";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { CreateUserOnSignUpInternalCommand } from "../create-user-on-sign-up.internal.command";
import type { OutboxPort } from "../../../../../shared/app/ports/outbox.port";
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
  async save(profile: Profile): Promise<void> {
    this.store.profiles.set(profile.userId, profile);
  }
}

/** The one repository whose write fails, for the rollback test. */
class FailingProfileRepository implements ProfileRepositoryPort {
  constructor(private readonly store: Store) {}
  async findByUserId(userId: string): Promise<Profile | null> {
    return this.store.profiles.get(userId) ?? null;
  }
  async save(_profile: Profile): Promise<void> {
    throw new Error("profileRepo.save always rejects in this test");
  }
}

class SpyOutbox implements OutboxPort {
  readonly published: BaseDomainEvent[] = [];
  readonly aggregateTypes: string[] = [];
  async publish(events: BaseDomainEvent[], aggregateType: string): Promise<void> {
    this.published.push(...events);
    this.aggregateTypes.push(aggregateType);
  }
}

describe("CreateUserOnSignUpInternalCommand — atomicity", () => {
  it("rolls back the user write when the profile write fails, leaving no orphan user row", async () => {
    const store = createStore();
    const userRepo = new FakeUserRepository(store);
    const profileRepo = new FailingProfileRepository(store);
    const unitOfWork = new InMemoryUnitOfWork(store);

    const command = new CreateUserOnSignUpInternalCommand(
      userRepo,
      profileRepo,
      unitOfWork,
      new SpyOutbox(),
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

  it("publishes nothing when the profile write fails", async () => {
    const store = createStore();
    const outbox = new SpyOutbox();
    const command = new CreateUserOnSignUpInternalCommand(
      new FakeUserRepository(store),
      new FailingProfileRepository(store),
      new InMemoryUnitOfWork(store),
      outbox,
    );

    await expect(
      command.execute({
        userId: "user-1",
        email: "new@ntizo.test",
        firstName: "New",
        lastName: "User",
      }),
    ).rejects.toThrow();

    // The publish is the last thing inside the transaction, so a sign-up that
    // never completed announces nothing. In Postgres the outbox insert would
    // roll back with the rest anyway; ordering it last means the in-process
    // dispatch the adapter queues is never even reached.
    expect(outbox.published).toEqual([]);
  });
});

describe("CreateUserOnSignUpInternalCommand — events", () => {
  function build(store: Store, outbox: OutboxPort) {
    return new CreateUserOnSignUpInternalCommand(
      new FakeUserRepository(store),
      new FakeProfileRepository(store),
      new InMemoryUnitOfWork(store),
      outbox,
    );
  }

  it("publishes user.registered so somebody can welcome them", async () => {
    const store = createStore();
    const outbox = new SpyOutbox();

    await build(store, outbox).execute({
      userId: "u1",
      email: "ana@ntizo.test",
      firstName: "Ana",
      lastName: "S",
    });

    expect(outbox.published.map((e) => e.eventName)).toEqual(["user.registered"]);
    expect(outbox.aggregateTypes).toEqual(["user"]);
  });

  it("carries the email and first name the welcome greets somebody by", async () => {
    const store = createStore();
    const outbox = new SpyOutbox();

    await build(store, outbox).execute({
      userId: "u1",
      email: "ana@ntizo.test",
      firstName: "Ana",
      lastName: "S",
    });

    expect(outbox.published[0]!.payload).toEqual({
      userId: "u1",
      email: "ana@ntizo.test",
      firstName: "Ana",
    });
    expect(outbox.published[0]!.aggregateId).toBe("u1");
  });

  // `""` is the literal value better-auth's `defaultValue: ""` produces for a
  // signup that sent no first name, so it is the case this normalisation
  // exists for. `"   "` is the stronger input — it survives a plain
  // falsy check — and is why the normalisation trims. Both are asserted
  // because passing one does not imply passing the other.
  for (const [label, firstName] of [
    ["the empty string better-auth defaults a missing name to", ""],
    ["a name that is only whitespace", "   "],
  ] as const) {
    it(`carries null rather than ${label}`, async () => {
      const store = createStore();
      const outbox = new SpyOutbox();

      await build(store, outbox).execute({
        userId: "u1",
        email: "ana@ntizo.test",
        firstName,
        lastName: "",
      });

      // "Welcome, !" is what an empty string renders as. Null says "no name
      // known" and lets the template choose a greeting that works without one.
      expect(
        (outbox.published[0]!.payload as { firstName: string | null }).firstName,
      ).toBeNull();
    });
  }

  it("publishes nothing on a retry, because the command already returned early", async () => {
    const store = createStore();
    const outbox = new SpyOutbox();
    store.users.set(
      "u1",
      User.create({ id: "u1", email: "ana@ntizo.test", role: "customer" }),
    );

    await build(store, outbox).execute({
      userId: "u1",
      email: "ana@ntizo.test",
      firstName: "Ana",
      lastName: "S",
    });

    // Idempotency has to cover the event too. A second welcome for one
    // registration is the failure mode a retry is supposed to prevent.
    expect(outbox.published).toEqual([]);
  });
});
