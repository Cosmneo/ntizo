import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import type { ProviderListItemDTO } from "@ntizo/shared";
import { AcceptProviderInviteCommand } from "../accept-provider-invite.command";
import type {
  ProviderInviteRepositoryPort,
  ProviderMemberRepositoryPort,
  ProviderRepositoryPort,
} from "../../../ports/outbound";
import type { OutboxPort } from "../../../../../../shared/app/ports/outbox.port";
import { Provider } from "../../../../domain/aggregates";
import { ProviderMember } from "../../../../domain/entities/provider-member";
import { ProviderInvite } from "../../../../domain/entities/provider-invite";
import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

class FakeOutboxPort implements OutboxPort {
  async publish(_events: BaseDomainEvent[], _aggregateType: string): Promise<void> {
    // no-op: this test only asserts on the rollback path (inviteRepo.save
    // rejects before publish is ever reached).
  }
}

/**
 * In-memory store shared by the fake repositories, plus a UoW double that
 * models Postgres rollback: `atomicExecute` snapshots the store before
 * running the work and restores it if the work throws.
 *
 * The invite fixture is pre-seeded before the transaction opens and is
 * fetched (read, outside the wrapped writes) then mutated in place via
 * `markAccepted()` inside the wrapped section. This test only asserts on
 * the *first* write (the member row), which lives in its own Map and is
 * unaffected by that aliasing, per the task contract: assert the first
 * write is not visible after rollback.
 */
interface Store {
  providers: Map<string, Provider>;
  members: Map<string, ProviderMember>;
  invites: Map<string, ProviderInvite>;
}

function createStore(): Store {
  return { providers: new Map(), members: new Map(), invites: new Map() };
}

class InMemoryUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly store: Store) {}

  async atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    const snapshot: Store = {
      providers: new Map(this.store.providers),
      members: new Map(this.store.members),
      invites: new Map(this.store.invites),
    };
    try {
      return await work();
    } catch (e) {
      this.store.providers = snapshot.providers;
      this.store.members = snapshot.members;
      this.store.invites = snapshot.invites;
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
    throw new Error("not used by this test");
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
    providerId: string,
    userId: string,
  ): Promise<ProviderMember | null> {
    for (const member of this.store.members.values()) {
      if (member.providerId === providerId && member.userId === userId) {
        return member;
      }
    }
    return null;
  }
  async save(member: ProviderMember): Promise<void> {
    this.store.members.set(member.id, member);
  }
  async delete(_providerId: string, _userId: string): Promise<void> {
    throw new Error("not used by this test");
  }
}

class FakeProviderInviteRepository implements ProviderInviteRepositoryPort {
  constructor(private readonly store: Store) {}
  async findById(id: string): Promise<ProviderInvite | null> {
    return this.store.invites.get(id) ?? null;
  }
  async findByToken(token: string): Promise<ProviderInvite | null> {
    for (const invite of this.store.invites.values()) {
      if (invite.token === token) return invite;
    }
    return null;
  }
  async findByProviderAndEmail(
    _providerId: string,
    _email: string,
  ): Promise<ProviderInvite | null> {
    throw new Error("not used by this test");
  }
  async findByProviderId(_providerId: string): Promise<ProviderInvite[]> {
    throw new Error("not used by this test");
  }
  async save(_invite: ProviderInvite): Promise<void> {
    throw new Error("inviteRepo.save always rejects in this test");
  }
  async delete(_id: string): Promise<void> {
    throw new Error("not used by this test");
  }
}

function authenticatedCtx(userId: string): ExecutionContext {
  return {
    requester: {
      type: "authenticated",
      user: {
        userId,
        email: "invitee@ntizo.test",
        firstName: "Invitee",
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

describe("AcceptProviderInviteCommand — atomicity", () => {
  it("rolls back the member write when the invite-accepted write fails, leaving no orphan member row", async () => {
    const store = createStore();

    const provider = Provider.create({
      id: randomUUID(),
      ownerUserId: "owner-1",
      type: "organization",
      name: "Acme Cleaning",
      slug: "acme-cleaning",
    });
    store.providers.set(provider.id, provider);

    const invite = ProviderInvite.create({
      id: randomUUID(),
      providerId: provider.id,
      email: "invitee@ntizo.test",
      role: "staff",
      token: "invite-token-1",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    store.invites.set(invite.id, invite);

    const providerRepo = new FakeProviderRepository(store);
    const memberRepo = new FakeProviderMemberRepository(store);
    const inviteRepo = new FakeProviderInviteRepository(store);
    const unitOfWork = new InMemoryUnitOfWork(store);

    const command = new AcceptProviderInviteCommand(
      providerRepo,
      memberRepo,
      inviteRepo,
      unitOfWork,
      new FakeOutboxPort(),
    );

    await expect(
      command.execute(authenticatedCtx("invitee-1"), {
        token: "invite-token-1",
      }),
    ).rejects.toThrow("inviteRepo.save always rejects in this test");

    // The bug: today the member row survives even though marking the invite
    // accepted failed afterwards.
    expect(
      await memberRepo.findByProviderAndUser(provider.id, "invitee-1"),
    ).toBeNull();
    expect(store.members.size).toBe(0);
  });
});
