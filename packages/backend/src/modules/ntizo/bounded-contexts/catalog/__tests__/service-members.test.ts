import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { ProviderListItemDTO } from "@ntizo/shared";

import { canPublish } from "../domain/service-rules";
import { Service } from "../domain/aggregates/service.aggregate";
import { SetServiceMembersCommand } from "../app/use-cases/set-service-members.command";
import type { ServiceRepositoryPort } from "../app/ports/outbound/service.repository.port";

import { RemoveProviderMemberCommand } from "../../provider/app/use-cases/membership/remove-provider-member.command";
import { Provider } from "../../provider/domain/aggregates";
import { ProviderMember } from "../../provider/domain/entities/provider-member";
import type {
  CatalogRepositoryPort,
  ProviderMemberRepositoryPort,
  ProviderRepositoryPort,
} from "../../provider/app/ports/outbound";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";
import type { ExecutionContext } from "../../../shared/infrastructure/execution-context";

/**
 * The kit's errors carry `code` beside `message`, not inside it — so
 * `toThrow(/CODE/)` matches nothing and passes or fails for the wrong reason.
 * Assert on the code itself. Mirrors `service-rules.test.ts`.
 */
const codeOf = (fn: () => void): unknown => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// canPublish — the member-count check, and where it sits relative to the
// checks that already existed.
// ---------------------------------------------------------------------------

describe("publishing needs a performer", () => {
  it("canPublish refuses a priced service nobody performs", () => {
    expect(
      codeOf(() =>
        canPublish({
          bookingMode: "priced",
          categoryId: "c1",
          hasSourceName: true,
          optionCount: 1,
          memberCount: 0,
        }),
      ),
    ).toBe("SERVICE_NEEDS_MEMBER");
  });

  it("canPublish refuses a quote service nobody performs", () => {
    expect(
      codeOf(() =>
        canPublish({
          bookingMode: "quote",
          categoryId: "c1",
          hasSourceName: true,
          optionCount: 0,
          memberCount: 0,
        }),
      ),
    ).toBe("SERVICE_NEEDS_MEMBER");
  });

  it("canPublish passes with one performer", () => {
    expect(() =>
      canPublish({
        bookingMode: "priced",
        categoryId: "c1",
        hasSourceName: true,
        optionCount: 1,
        memberCount: 1,
      }),
    ).not.toThrow();
  });

  // The category check still runs first: a service missing both should
  // report the category, so the form's field-by-field messages stay in one
  // order.
  it("a missing category is still reported before a missing performer", () => {
    expect(
      codeOf(() =>
        canPublish({
          bookingMode: "priced",
          categoryId: null,
          hasSourceName: true,
          optionCount: 1,
          memberCount: 0,
        }),
      ),
    ).toBe("SERVICE_CATEGORY_REQUIRED");
  });
});

// ---------------------------------------------------------------------------
// SetServiceMembersCommand
// ---------------------------------------------------------------------------

class FakeServiceRepo implements ServiceRepositoryPort {
  stored = new Map<string, Service>();
  // `prov-1:user-1` and `prov-1:user-2` are both plain workspace members —
  // `SetServiceMembersCommand` uses `isProviderMember`, not the
  // owner/admin-only check, the same split `ManageOptionsCommand` draws.
  workspaceMembers = new Set<string>(["prov-1:user-1", "prov-1:user-2"]);
  // `m1`/`m2` are provider-member ids (what `service_member.member_id`
  // actually references) that belong to prov-1; `foreign` deliberately does
  // not.
  providerMembers = new Set<string>(["prov-1:m1", "prov-1:m2"]);

  async findById(id: string): Promise<Service | null> {
    return this.stored.get(id) ?? null;
  }
  async save(service: Service): Promise<void> {
    this.stored.set(service.id, service);
  }
  async delete(id: string): Promise<void> {
    this.stored.delete(id);
  }
  async isProviderMember(providerId: string, userId: string): Promise<boolean> {
    return this.workspaceMembers.has(`${providerId}:${userId}`);
  }
  async isProviderOwnerOrAdmin(): Promise<boolean> {
    throw new Error("not used by SetServiceMembersCommand");
  }
  async memberBelongsToProvider(providerId: string, memberId: string): Promise<boolean> {
    return this.providerMembers.has(`${providerId}:${memberId}`);
  }
  async unpublishServicesWithoutMembers(): Promise<{ serviceId: string; name: string }[]> {
    throw new Error("not used by SetServiceMembersCommand");
  }
}

const fixedOption = {
  id: "opt-1",
  pricingMode: "fixed" as const,
  amountMinor: 30000,
  currency: "MZN",
  durationMinutes: 30,
  minMinutes: null,
  stepMinutes: null,
  name: "Só cabelo",
};

function draftService(): Service {
  return Service.create({
    id: randomUUID(),
    providerId: "prov-1",
    categoryId: "cat-1",
    sourceLocale: "pt-MZ",
    locationType: "at_provider",
    bookingMode: "priced",
    name: "Corte",
  });
}

describe("SetServiceMembersCommand", () => {
  it("a staff member may set who performs a service", async () => {
    const repo = new FakeServiceRepo();
    const service = draftService();
    repo.stored.set(service.id, service);

    const result = await new SetServiceMembersCommand(repo).execute({
      requesterUserId: "user-2",
      serviceId: service.id,
      memberIds: ["m1"],
    });

    expect(result).toEqual({ ok: true });
    expect(repo.stored.get(service.id)!.toJSON().memberIds).toEqual(["m1"]);
  });

  it("someone outside the workspace is refused", async () => {
    const repo = new FakeServiceRepo();
    const service = draftService();
    repo.stored.set(service.id, service);

    await expect(
      new SetServiceMembersCommand(repo).execute({
        requesterUserId: "stranger",
        serviceId: service.id,
        memberIds: ["m1"],
      }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
    // Never got to the mutation.
    expect(repo.stored.get(service.id)!.toJSON().memberIds).toEqual([]);
  });

  it("a member id from another workspace is refused", async () => {
    const repo = new FakeServiceRepo();
    const service = draftService();
    repo.stored.set(service.id, service);

    await expect(
      new SetServiceMembersCommand(repo).execute({
        requesterUserId: "user-1",
        serviceId: service.id,
        memberIds: ["foreign"],
      }),
    ).rejects.toMatchObject({ code: "MEMBER_NOT_IN_PROVIDER" });
    expect(repo.stored.get(service.id)!.toJSON().memberIds).toEqual([]);
  });

  it("clearing the last performer of a published service is refused", async () => {
    const repo = new FakeServiceRepo();
    const service = draftService();
    service.addOption(fixedOption);
    service.setMembers(["m1"]);
    service.publish();
    repo.stored.set(service.id, service);

    await expect(
      new SetServiceMembersCommand(repo).execute({
        requesterUserId: "user-1",
        serviceId: service.id,
        memberIds: [],
      }),
    ).rejects.toMatchObject({ code: "SERVICE_NEEDS_MEMBER" });
    // Untouched: the aggregate still lists its one performer.
    expect(repo.stored.get(service.id)!.toJSON().memberIds).toEqual(["m1"]);
  });

  it("clearing the last performer of a draft service is allowed", async () => {
    const repo = new FakeServiceRepo();
    const service = draftService();
    service.setMembers(["m1"]);
    repo.stored.set(service.id, service);

    await expect(
      new SetServiceMembersCommand(repo).execute({
        requesterUserId: "user-1",
        serviceId: service.id,
        memberIds: [],
      }),
    ).resolves.toEqual({ ok: true });
    expect(repo.stored.get(service.id)!.toJSON().memberIds).toEqual([]);
  });

  it("duplicate member ids are collapsed", async () => {
    const repo = new FakeServiceRepo();
    const service = draftService();
    repo.stored.set(service.id, service);

    await new SetServiceMembersCommand(repo).execute({
      requesterUserId: "user-1",
      serviceId: service.id,
      memberIds: ["m1", "m1"],
    });

    expect(repo.stored.get(service.id)!.toJSON().memberIds).toEqual(["m1"]);
  });
});

// ---------------------------------------------------------------------------
// Removing a member from the workspace — the other way a published service
// can end up with nobody, and the one that is not refusable.
// ---------------------------------------------------------------------------

interface FakeServiceRow {
  id: string;
  providerId: string;
  name: string;
  status: "draft" | "published" | "archived";
}

/**
 * Shared in-memory state for the member-removal tests.
 *
 * Models the two things that make `RemoveProviderMemberCommand` interesting
 * here: the FK cascade that empties `service_member` the moment a
 * `provider_member` row is deleted (simulated directly in
 * `FakeProviderMemberRepo.delete` below, since a real cascade is a database
 * behaviour no fake can execute), and the catalog's own
 * `unpublishServicesWithoutMembers` sweep that the command calls afterwards.
 */
class FakeWorkspace {
  providers = new Map<string, Provider>();
  members = new Map<string, ProviderMember>();
  services = new Map<string, FakeServiceRow>();
  /** `${serviceId}:${memberId}` — mirrors the `service_member` table. */
  serviceMembers = new Set<string>();

  statusOf(serviceId: string): string | undefined {
    return this.services.get(serviceId)?.status;
  }
}

class FakeProviderRepo implements ProviderRepositoryPort {
  constructor(private readonly ws: FakeWorkspace) {}
  async findById(id: string): Promise<Provider | null> {
    return this.ws.providers.get(id) ?? null;
  }
  async findByOwnerUserId(): Promise<Provider[]> {
    throw new Error("not used by this test");
  }
  async findBySlug(): Promise<Provider | null> {
    throw new Error("not used by this test");
  }
  async findAllByOwnerOrMemberUserId(): Promise<Provider[]> {
    throw new Error("not used by this test");
  }
  async findListItemsForUser(): Promise<ProviderListItemDTO[]> {
    throw new Error("not used by this test");
  }
  async save(provider: Provider): Promise<void> {
    this.ws.providers.set(provider.id, provider);
  }
}

class FakeProviderMemberRepo implements ProviderMemberRepositoryPort {
  constructor(private readonly ws: FakeWorkspace) {}
  async findByProviderId(providerId: string): Promise<ProviderMember[]> {
    return [...this.ws.members.values()].filter((m) => m.providerId === providerId);
  }
  async findByProviderAndUser(providerId: string, userId: string): Promise<ProviderMember | null> {
    return (
      [...this.ws.members.values()].find(
        (m) => m.providerId === providerId && m.userId === userId,
      ) ?? null
    );
  }
  async save(member: ProviderMember): Promise<void> {
    this.ws.members.set(member.id, member);
  }
  async delete(providerId: string, userId: string): Promise<void> {
    const member = [...this.ws.members.values()].find(
      (m) => m.providerId === providerId && m.userId === userId,
    );
    if (!member) return;
    this.ws.members.delete(member.id);
    // The FK cascade: `service_member.member_id` references
    // `provider_member.id` ON DELETE CASCADE, so this member's rows in
    // `service_member` vanish in the same transaction, before
    // `unpublishServicesWithoutMembers` ever runs.
    for (const key of [...this.ws.serviceMembers]) {
      if (key.endsWith(`:${member.id}`)) this.ws.serviceMembers.delete(key);
    }
  }
}

class FakeCatalogRepo implements CatalogRepositoryPort {
  constructor(private readonly ws: FakeWorkspace) {}
  async unpublishServicesWithoutMembers(
    providerId: string,
  ): Promise<{ serviceId: string; name: string }[]> {
    const changed: { serviceId: string; name: string }[] = [];
    for (const svc of this.ws.services.values()) {
      if (svc.providerId !== providerId || svc.status !== "published") continue;
      const hasPerformer = [...this.ws.serviceMembers].some((k) => k.startsWith(`${svc.id}:`));
      if (!hasPerformer) {
        svc.status = "draft";
        changed.push({ serviceId: svc.id, name: svc.name });
      }
    }
    return changed;
  }
}

class PassthroughUnitOfWork implements UnitOfWorkPort {
  atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

class FakeOutboxPort implements OutboxPort {
  async publish(_events: BaseDomainEvent[], _aggregateType: string): Promise<void> {}
}

function authenticatedCtx(userId: string): ExecutionContext {
  return {
    requester: {
      type: "authenticated",
      user: {
        userId,
        email: "owner@ntizo.test",
        firstName: "Dona",
        lastName: "Do Salão",
        platformRole: "customer",
      },
    },
    metadata: { requestId: "req-1", receivedAt: new Date() },
  };
}

function seedWorkspace() {
  const ws = new FakeWorkspace();
  const provider = Provider.create({
    id: "prov-1",
    ownerUserId: "owner-1",
    type: "organization",
    name: "Salão Acme",
    slug: "salao-acme",
    commissionBps: 1000,
  });
  ws.providers.set(provider.id, provider);

  const barber = ProviderMember.create({
    id: "member-1",
    providerId: provider.id,
    userId: "user-2",
    role: "staff",
  });
  ws.members.set(barber.id, barber);

  return { ws, provider, barber };
}

function buildRemoveMember(ws: FakeWorkspace): RemoveProviderMemberCommand {
  return new RemoveProviderMemberCommand(
    new FakeProviderRepo(ws),
    new FakeProviderMemberRepo(ws),
    new FakeCatalogRepo(ws),
    new PassthroughUnitOfWork(),
    new FakeOutboxPort(),
  );
}

describe("removing a member from the workspace", () => {
  it("a published service left with nobody is unpublished and named back", async () => {
    const { ws, provider, barber } = seedWorkspace();
    ws.services.set("s1", { id: "s1", providerId: provider.id, name: "Corte", status: "published" });
    ws.serviceMembers.add(`s1:${barber.id}`);

    const removeMember = buildRemoveMember(ws);
    const result = await removeMember.execute(authenticatedCtx(provider.ownerUserId), {
      providerId: provider.id,
      userId: barber.userId,
    });

    expect(result.unpublishedServices).toEqual([{ serviceId: "s1", name: "Corte" }]);
    expect(ws.statusOf("s1")).toBe("draft");
  });

  it("a service with another performer left is untouched", async () => {
    const { ws, provider, barber } = seedWorkspace();
    const other = ProviderMember.create({
      id: "member-2",
      providerId: provider.id,
      userId: "user-3",
      role: "staff",
    });
    ws.members.set(other.id, other);

    ws.services.set("s1", { id: "s1", providerId: provider.id, name: "Corte", status: "published" });
    ws.serviceMembers.add(`s1:${barber.id}`);
    ws.serviceMembers.add(`s1:${other.id}`);

    const removeMember = buildRemoveMember(ws);
    const result = await removeMember.execute(authenticatedCtx(provider.ownerUserId), {
      providerId: provider.id,
      userId: barber.userId,
    });

    expect(result.unpublishedServices).toEqual([]);
    expect(ws.statusOf("s1")).toBe("published");
  });

  it("a draft service with nobody is left alone — it was already not live", async () => {
    const { ws, provider, barber } = seedWorkspace();
    ws.services.set("s1", { id: "s1", providerId: provider.id, name: "Corte", status: "draft" });
    ws.serviceMembers.add(`s1:${barber.id}`);

    const removeMember = buildRemoveMember(ws);
    const result = await removeMember.execute(authenticatedCtx(provider.ownerUserId), {
      providerId: provider.id,
      userId: barber.userId,
    });

    expect(result.unpublishedServices).toEqual([]);
    expect(ws.statusOf("s1")).toBe("draft");
  });
});
