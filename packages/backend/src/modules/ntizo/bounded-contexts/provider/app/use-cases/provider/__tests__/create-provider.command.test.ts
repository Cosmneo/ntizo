import { describe, expect, it } from "bun:test";

/** Records that a wallet was asked for, so a test can assert it happened. */
const walletCalls: { providerId: string }[] = [];
const walletRepo = {
  async createForProvider(input: { providerId: string }) {
    walletCalls.push(input);
  },
};
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import type { ProviderListItemDTO } from "@ntizo/shared";
import { CreateProviderCommand } from "../create-provider.command";
import type {
  ProviderMemberRepositoryPort,
  ProviderRepositoryPort,
} from "../../../ports/outbound";
import type { OutboxPort } from "../../../../../../shared/app/ports/outbox.port";
import { Provider } from "../../../../domain/aggregates";
import { ProviderMember } from "../../../../domain/entities/provider-member";
import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

class FakeOutboxPort implements OutboxPort {
  async publish(_events: BaseDomainEvent[], _aggregateType: string): Promise<void> {
    // no-op: this test only asserts on the rollback path, which never
    // reaches a publish call.
  }
}

class CapturingOutboxPort implements OutboxPort {
  published: BaseDomainEvent[] = [];
  async publish(events: BaseDomainEvent[], _aggregateType: string): Promise<void> {
    this.published.push(...events);
  }
}

/**
 * In-memory store shared by the fake repositories, plus a UoW double that
 * models Postgres rollback: `atomicExecute` snapshots the store before
 * running the work and restores it if the work throws. Both the provider
 * and member are created fresh and never mutated in place before the
 * failure point in this flow, so a shallow copy of each Map is a sufficient
 * point-in-time snapshot.
 */
interface Store {
  providers: Map<string, Provider>;
  members: Map<string, ProviderMember>;
}

function createStore(): Store {
  return { providers: new Map(), members: new Map() };
}

class InMemoryUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly store: Store) {}

  async atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    const snapshot: Store = {
      providers: new Map(this.store.providers),
      members: new Map(this.store.members),
    };
    try {
      return await work();
    } catch (e) {
      this.store.providers = snapshot.providers;
      this.store.members = snapshot.members;
      throw e;
    }
  }
}

class FakeProviderRepository implements ProviderRepositoryPort {
  constructor(private readonly store: Store) {}
  async findById(id: string): Promise<Provider | null> {
    return this.store.providers.get(id) ?? null;
  }
  async findByOwnerUserId(_ownerUserId: string): Promise<Provider[]> {
    throw new Error("not used by this test");
  }
  async findBySlug(_slug: string): Promise<Provider | null> {
    // Free. These tests are about atomicity and events, not slug collisions —
    // they threw here until the command started resolving collisions, which is
    // the fake correctly reporting that its assumptions had moved.
    return null;
  }
  async findAllByOwnerOrMemberUserId(_userId: string): Promise<Provider[]> {
    throw new Error("not used by this test");
  }
  async findListItemsForUser(
    _userId: string,
  ): Promise<ProviderListItemDTO[]> {
    throw new Error("not used by this test");
  }
  async save(provider: Provider): Promise<void> {
    this.store.providers.set(provider.id, provider);
  }
}

class FakeProviderMemberRepository implements ProviderMemberRepositoryPort {
  constructor(private readonly store: Store) {}
  async findByProviderId(_providerId: string): Promise<ProviderMember[]> {
    throw new Error("not used by this test");
  }
  async findByProviderAndUser(
    _providerId: string,
    _userId: string,
  ): Promise<ProviderMember | null> {
    throw new Error("not used by this test");
  }
  async save(_member: ProviderMember): Promise<void> {
    throw new Error("memberRepo.save always rejects in this test");
  }
  async delete(_providerId: string, _userId: string): Promise<void> {
    throw new Error("not used by this test");
  }
}

class WorkingProviderMemberRepository implements ProviderMemberRepositoryPort {
  constructor(private readonly store: Store) {}
  async findByProviderId(_providerId: string): Promise<ProviderMember[]> {
    throw new Error("not used by this test");
  }
  async findByProviderAndUser(
    _providerId: string,
    _userId: string,
  ): Promise<ProviderMember | null> {
    throw new Error("not used by this test");
  }
  async save(member: ProviderMember): Promise<void> {
    this.store.members.set(member.id, member);
  }
  async delete(_providerId: string, _userId: string): Promise<void> {
    throw new Error("not used by this test");
  }
}

function authenticatedCtx(userId: string): ExecutionContext {
  return {
    requester: {
      type: "authenticated",
      user: {
        userId,
        email: "owner@ntizo.test",
        firstName: "Owner",
        lastName: "Person",
        platformRole: "customer",
      },
    },
    metadata: {
      requestId: "req-1",
      receivedAt: new Date(),
    },
  };
}

describe("CreateProviderCommand — atomicity", () => {
  it("rolls back the provider write when the member write fails, leaving no orphan provider row", async () => {
    const store = createStore();
    const providerRepo = new FakeProviderRepository(store);
    const memberRepo = new FakeProviderMemberRepository(store);
    const unitOfWork = new InMemoryUnitOfWork(store);

    const command = new CreateProviderCommand(
      providerRepo,
      memberRepo,
      walletRepo as never,
      unitOfWork,
      new FakeOutboxPort(),
    );

    await expect(
      command.execute(authenticatedCtx("owner-1"), {
        type: "organization",
        name: "Acme Cleaning",
        slug: "acme-cleaning",
      }),
    ).rejects.toThrow("memberRepo.save always rejects in this test");

    // The bug: today the provider row survives with no owner member row,
    // making it invisible forever (provider.mine lists via provider_member).
    expect(store.providers.size).toBe(0);
    expect(store.members.size).toBe(0);
  });
});

describe("CreateProviderCommand — events", () => {
  it("publishes ProviderMemberAdded for the owner alongside ProviderCreated", async () => {
    // The owner member row is inserted directly (see the command), but a
    // future projection rebuilding membership purely from the event stream
    // must still see it — every provider is guaranteed to have this one
    // member. Mirrors accept-provider-invite.command.ts, which already
    // records ProviderMemberAdded for an invitee.
    const store = createStore();
    const providerRepo = new FakeProviderRepository(store);
    const memberRepo = new WorkingProviderMemberRepository(store);
    const unitOfWork = new InMemoryUnitOfWork(store);
    const outboxPort = new CapturingOutboxPort();

    const command = new CreateProviderCommand(
      providerRepo,
      memberRepo,
      walletRepo as never,
      unitOfWork,
      outboxPort,
    );

    const result = await command.execute(authenticatedCtx("owner-1"), {
      type: "organization",
      name: "Acme Cleaning",
      slug: "acme-cleaning",
    });

    const eventNames = outboxPort.published.map((e) => e.eventName);
    expect(eventNames).toContain("provider.created");
    expect(eventNames).toContain("provider.member.added");

    const memberAdded = outboxPort.published.find(
      (e) => e.eventName === "provider.member.added",
    );
    expect(memberAdded?.payload).toEqual({
      providerId: result.providerId,
      userId: "owner-1",
      role: "owner",
    });
  });
});
