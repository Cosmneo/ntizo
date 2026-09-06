import { beforeEach, describe, expect, it } from "bun:test";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { Service } from "../domain/aggregates/service.aggregate";
import { CreateServiceCommand } from "../app/use-cases/create-service.command";
import { UpdateServiceCommand } from "../app/use-cases/update-service.command";
import { ManageOptionsCommand } from "../app/use-cases/manage-options.command";
import { SetServiceStatusCommand } from "../app/use-cases/set-service-status.command";
import { SetServiceTranslationCommand } from "../app/use-cases/set-service-translation.command";
import type { ServiceRepositoryPort } from "../app/ports/outbound/service.repository.port";
import type { OutboxPort } from "../../../shared/app/ports/outbox.port";

/**
 * Flips `insideTransaction` around `work()`, and resets an `order` log at
 * the start of every call, so `FakeRepo.save` and `CapturingOutbox.publish`
 * can each stamp themselves onto it. The earlier fake ran `work()` inline
 * with no way to tell "called inside the transaction" apart from "called
 * after it returned" — which is why moving a command's publish entirely
 * outside `atomicExecute`, or ahead of `repo.save` but still inside it,
 * changed no test's outcome. Both are now directly observable.
 */
class TrackingUnitOfWork implements UnitOfWorkPort {
  insideTransaction = false;
  order: string[] = [];

  async atomicExecute<T>(work: () => Promise<T>): Promise<T> {
    this.insideTransaction = true;
    this.order = [];
    try {
      return await work();
    } finally {
      this.insideTransaction = false;
    }
  }
}

class FakeRepo implements ServiceRepositoryPort {
  saved: Service[] = [];
  stored = new Map<string, Service>();
  // `user-1` is the owner every other describe block writes as, `user-2` is a
  // staff member and `user-3` an admin — both members, so `isProviderMember`
  // (every command but `SetServiceStatusCommand`) sees them the same way.
  members = new Set<string>(["prov-1:user-1", "prov-1:user-2", "prov-1:user-3"]);
  roles = new Map<string, "owner" | "admin" | "staff">([
    ["prov-1:user-1", "owner"],
    ["prov-1:user-2", "staff"],
    ["prov-1:user-3", "admin"],
  ]);
  // Which workspaces the platform has approved. `prov-1` is every other
  // block's workspace and is active, so nothing outside this fixture has to
  // know the gate exists; a test about a workspace still under review takes
  // it out of the set.
  activeProviders = new Set<string>(["prov-1"]);
  // The `provider_member.id` behind each user — what `service_member` rows
  // actually reference, and what `CreateServiceCommand` now seeds a new
  // service's `memberIds` with via `findMemberIdForUser`.
  providerMemberIds = new Map<string, string>([
    ["prov-1:user-1", "member-1"],
    ["prov-1:user-2", "member-2"],
    ["prov-1:user-3", "member-3"],
  ]);

  constructor(private readonly unitOfWork: TrackingUnitOfWork) {}

  async findById(id: string) { return this.stored.get(id) ?? null; }
  async save(s: Service) {
    this.saved.push(s);
    this.stored.set(s.id, s);
    this.unitOfWork.order.push("save");
  }
  async delete(id: string) { this.stored.delete(id); }
  async isProviderMember(providerId: string, userId: string) {
    return this.members.has(`${providerId}:${userId}`);
  }
  async findMemberIdForUser(providerId: string, userId: string) {
    return this.providerMemberIds.get(`${providerId}:${userId}`) ?? null;
  }
  async isProviderOwnerOrAdmin(providerId: string, userId: string) {
    const role = this.roles.get(`${providerId}:${userId}`);
    return role === "owner" || role === "admin";
  }
  async isProviderActive(providerId: string) {
    return this.activeProviders.has(providerId);
  }
  async memberBelongsToProvider(): Promise<boolean> {
    throw new Error("not used by these tests — set members directly on the aggregate");
  }
  async unpublishServicesWithoutMembers(): Promise<{ serviceId: string; name: string }[]> {
    throw new Error("not used by these tests");
  }
}

/**
 * Records what each command actually hands the outbox — the layer that was
 * missing entirely before this round — plus, per batch, whether that call
 * landed inside `unitOfWork.atomicExecute` and after `repo.save` had
 * already run within that same cycle. Mirrors
 * `decide-provider-status.command.test.ts`'s `CapturingOutbox`, extended
 * with the two booleans a plain "was publish called" assertion cannot see.
 */
class CapturingOutbox implements OutboxPort {
  published: {
    events: BaseDomainEvent[];
    aggregateType: string;
    insideTransaction: boolean;
    afterSave: boolean;
  }[] = [];

  constructor(private readonly unitOfWork: TrackingUnitOfWork) {}

  async publish(events: BaseDomainEvent[], aggregateType: string): Promise<void> {
    this.published.push({
      events,
      aggregateType,
      insideTransaction: this.unitOfWork.insideTransaction,
      afterSave: this.unitOfWork.order.includes("save"),
    });
    this.unitOfWork.order.push("publish");
  }
}

let repo: FakeRepo;
let outbox: CapturingOutbox;
let unitOfWork: TrackingUnitOfWork;
beforeEach(() => {
  unitOfWork = new TrackingUnitOfWork();
  repo = new FakeRepo(unitOfWork);
  outbox = new CapturingOutbox(unitOfWork);
});

const base = {
  requesterUserId: "user-1",
  providerId: "prov-1",
  categoryId: "cat-1",
  sourceLocale: "pt-MZ",
  locationType: "at_provider" as const,
  bookingMode: "priced" as const,
  name: "Corte de cabelo",
};

describe("CreateServiceCommand", () => {
  it("creates a draft owned by the provider", async () => {
    const out = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    expect(out.serviceId).toBeTruthy();
    expect(repo.saved[0]!.toJSON().status).toBe("draft");
  });

  it("refuses somebody who does not belong to the workspace", async () => {
    await expect(
      new CreateServiceCommand(repo, unitOfWork, outbox).execute({ ...base, requesterUserId: "stranger" }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
    expect(repo.saved).toHaveLength(0);
  });

  it("gives a quote service its form and no options", async () => {
    const out = await new CreateServiceCommand(repo, unitOfWork, outbox).execute({ ...base, bookingMode: "quote" });
    const json = repo.stored.get(out.serviceId)!.toJSON();
    expect(json.quoteForm?.responseHours).toBe(48);
    expect(json.options).toEqual([]);
  });

  it("adds the creator as the service's first performer", async () => {
    // Whoever creates a service is inserted into it — design spec,
    // "Additions to slice 1". `base.requesterUserId` is user-1, whose
    // provider-member id in this fixture is "member-1".
    const out = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    expect(repo.stored.get(out.serviceId)!.toJSON().memberIds).toEqual(["member-1"]);
  });

  it("is publishable without a separate members.set call", async () => {
    // The whole point of seeding the creator on creation: a service should
    // not be born unpublishable for want of a performer nobody was asked to
    // add.
    const out = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId: out.serviceId,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });
    await new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
      requesterUserId: "user-1",
      serviceId: out.serviceId,
      status: "published",
    });
    expect(repo.stored.get(out.serviceId)!.toJSON().status).toBe("published");
  });
});

describe("ManageOptionsCommand", () => {
  async function withService() {
    const out = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    return out.serviceId;
  }

  it("adds an option and makes it the default", async () => {
    const id = await withService();
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId: id,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });
    expect(repo.stored.get(id)!.toJSON().options[0]!.isDefault).toBe(true);
  });

  it("refuses a stranger", async () => {
    const id = await withService();
    await expect(
      new ManageOptionsCommand(repo).add({
        requesterUserId: "stranger",
        serviceId: id,
        pricingMode: "fixed",
        amountMinor: 30000,
        currency: "MZN",
        durationMinutes: 30,
        minMinutes: null,
        stepMinutes: null,
        name: "x",
      }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
  });

  it("refuses an id that is not there", async () => {
    await expect(
      new ManageOptionsCommand(repo).remove({
        requesterUserId: "user-1",
        serviceId: "nope",
        optionId: "x",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_NOT_FOUND" });
  });

  it("refuses a stranger trying to update an option", async () => {
    const id = await withService();
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId: id,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });
    const optionId = repo.stored.get(id)!.toJSON().options[0]!.id;
    await expect(
      new ManageOptionsCommand(repo).update({
        requesterUserId: "stranger",
        serviceId: id,
        optionId,
        name: "Roubado",
      }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
    // Nothing changed: the membership check ran before the mutation.
    expect(
      repo.stored.get(id)!.toJSON().options[0]!.translations[0]!.name,
    ).toBe("Só cabelo");
  });

  it("refuses a stranger trying to remove an option", async () => {
    const id = await withService();
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId: id,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });
    const optionId = repo.stored.get(id)!.toJSON().options[0]!.id;
    await expect(
      new ManageOptionsCommand(repo).remove({
        requesterUserId: "stranger",
        serviceId: id,
        optionId,
      }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
    expect(repo.stored.get(id)!.toJSON().options).toHaveLength(1);
  });

  it("refuses a stranger trying to reorder options", async () => {
    const id = await withService();
    await expect(
      new ManageOptionsCommand(repo).reorder({
        requesterUserId: "stranger",
        serviceId: id,
        orderedIds: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
  });

  it("refuses a reorder list with the same option id twice", async () => {
    const id = await withService();
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId: id,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId: id,
      pricingMode: "fixed",
      amountMinor: 50000,
      currency: "MZN",
      durationMinutes: 60,
      minMinutes: null,
      stepMinutes: null,
      name: "Cabelo e barba",
    });
    const before = repo.stored.get(id)!.toJSON().options;
    const [first, second] = before;

    // Mirrors ReorderCategoriesCommand: a repeated id is refused, not
    // deduplicated. `Service.reorderOptions`'s `flatMap` would otherwise
    // write two entries claiming the same option, corrupting the list.
    await expect(
      new ManageOptionsCommand(repo).reorder({
        requesterUserId: "user-1",
        serviceId: id,
        orderedIds: [first!.id, second!.id, first!.id],
      }),
    ).rejects.toMatchObject({ code: "OPTION_ORDER_INVALID" });

    // Untouched: the option list is exactly what it was before the call.
    expect(repo.stored.get(id)!.toJSON().options).toEqual(before);
  });
});

describe("SetServiceStatusCommand", () => {
  async function withOption() {
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });
    // A performer: `canPublish` now refuses an unpublished service with
    // nobody to perform it, and every caller of this helper publishes.
    // Setting it directly on the aggregate rather than through
    // `SetServiceMembersCommand` keeps this fixture independent of that
    // command's own tests.
    repo.stored.get(serviceId)!.setMembers(["member-1"]);
    return serviceId;
  }

  it("refuses to publish a priced service with no options", async () => {
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    // A performer, so this isolates the option check this test is named
    // for from the member check `canPublish` now runs first.
    repo.stored.get(serviceId)!.setMembers(["member-1"]);
    await expect(
      new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
        requesterUserId: "user-1",
        serviceId,
        status: "published",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_NEEDS_OPTION" });
  });

  it("refuses to publish a service with nobody performing it", async () => {
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });
    // `CreateServiceCommand` now seeds the creator as a performer, so a
    // service can no longer be born with nobody in it — cleared directly on
    // the aggregate to still exercise this refusal. Mirrors
    // `SetServiceMembersCommand`'s own "clearing the last performer of a
    // draft service is allowed" test relying on the same possibility.
    repo.stored.get(serviceId)!.setMembers([]);
    await expect(
      new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
        requesterUserId: "user-1",
        serviceId,
        status: "published",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_NEEDS_MEMBER" });
  });

  it("refuses to publish while the workspace is still under review", async () => {
    // The bug this guards: a workspace created but never approved could
    // publish a service, get a success toast, and never appear in the
    // browse — because the storefront's own WHERE requires an active
    // provider (`conditionsFor`, service-read.repository.ts). Publishing
    // silently did nothing, and nothing told the person that.
    const serviceId = await withOption();
    repo.activeProviders.delete("prov-1");
    await expect(
      new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
        requesterUserId: "user-1",
        serviceId,
        status: "published",
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_NOT_ACTIVE" });
    expect(repo.stored.get(serviceId)!.toJSON().status).toBe("draft");
  });

  it("still lets an inactive workspace take a service back down", async () => {
    // The gate is on going live, not on every status change. A workspace
    // suspended while a service was published must still be able to draft
    // it — refusing that would trap the row in a state its owner can see
    // and cannot leave.
    const serviceId = await withOption();
    await new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
      requesterUserId: "user-1",
      serviceId,
      status: "published",
    });
    repo.activeProviders.delete("prov-1");
    await new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
      requesterUserId: "user-1",
      serviceId,
      status: "draft",
    });
    expect(repo.stored.get(serviceId)!.toJSON().status).toBe("draft");
  });

  it("refuses a stranger trying to change status", async () => {
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await expect(
      new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
        requesterUserId: "stranger",
        serviceId,
        status: "archived",
      }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_OWNER_OR_ADMIN" });
    // Never got to the mutation: still a draft, not archived.
    expect(repo.stored.get(serviceId)!.toJSON().status).toBe("draft");
  });

  it("refuses a staff member trying to change status", async () => {
    // user-2 is a plain member (added to the catalogue by `withOption`, which
    // acts as the owner) but is only staff on this workspace — the exact
    // split the product owner drew: any member may describe and price a
    // service, only owner/admin may decide whether it is live.
    const serviceId = await withOption();
    await expect(
      new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
        requesterUserId: "user-2",
        serviceId,
        status: "published",
      }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_OWNER_OR_ADMIN" });
    // Never got to the mutation: still a draft, not published.
    expect(repo.stored.get(serviceId)!.toJSON().status).toBe("draft");
  });

  it("lets an owner publish", async () => {
    const serviceId = await withOption();
    await new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
      requesterUserId: "user-1",
      serviceId,
      status: "published",
    });
    expect(repo.stored.get(serviceId)!.toJSON().status).toBe("published");
  });

  it("lets an admin publish", async () => {
    const serviceId = await withOption();
    await new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
      requesterUserId: "user-3",
      serviceId,
      status: "published",
    });
    expect(repo.stored.get(serviceId)!.toJSON().status).toBe("published");
  });

  it("still lets a staff member add an option and set a translation", async () => {
    // The half of the decision that is easy to break by accident: tightening
    // `SetServiceStatusCommand` must not touch `ManageOptionsCommand` or
    // `SetServiceTranslationCommand`, which stay on plain membership.
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-2",
      serviceId,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });
    expect(repo.stored.get(serviceId)!.toJSON().options[0]!.isDefault).toBe(true);

    await new SetServiceTranslationCommand(repo).execute({
      requesterUserId: "user-2",
      serviceId,
      locale: "en-US",
      name: "Haircut",
      description: null,
    });
    const translations = repo.stored.get(serviceId)!.toJSON().translations;
    expect(translations.find((t) => t.locale === "en-US")?.name).toBe("Haircut");
  });
});

describe("UpdateServiceCommand", () => {
  it("updates the category of an existing service", async () => {
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await new UpdateServiceCommand(repo).execute({
      requesterUserId: "user-1",
      serviceId,
      categoryId: "cat-2",
    });
    expect(repo.stored.get(serviceId)!.toJSON().categoryId).toBe("cat-2");
  });

  it("refuses an id that is not there", async () => {
    await expect(
      new UpdateServiceCommand(repo).execute({
        requesterUserId: "user-1",
        serviceId: "nope",
        categoryId: "cat-2",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_NOT_FOUND" });
  });

  it("refuses a stranger", async () => {
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await expect(
      new UpdateServiceCommand(repo).execute({
        requesterUserId: "stranger",
        serviceId,
        categoryId: "cat-2",
      }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
    // Never got to the mutation: category is unchanged.
    expect(repo.stored.get(serviceId)!.toJSON().categoryId).toBe("cat-1");
  });

  it("refuses a quote form on a priced service", async () => {
    // `base` is `bookingMode: "priced"`. This input type carries `quoteForm`
    // regardless of the service's booking mode — nothing upstream of the
    // aggregate stops it, so the aggregate itself has to.
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await expect(
      new UpdateServiceCommand(repo).execute({
        requesterUserId: "user-1",
        serviceId,
        quoteForm: {
          responseHours: 24,
          askDeadline: true,
          askPhotos: true,
          askLocation: true,
          intro: null,
        },
      }),
    ).rejects.toMatchObject({ code: "SERVICE_QUOTE_FORM_NOT_ALLOWED" });
    expect(repo.stored.get(serviceId)!.toJSON().quoteForm).toBeNull();
  });
});

describe("SetServiceTranslationCommand", () => {
  it("sets a service-level translation", async () => {
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await new SetServiceTranslationCommand(repo).execute({
      requesterUserId: "user-1",
      serviceId,
      locale: "en-US",
      name: "Haircut",
      description: null,
    });
    const translations = repo.stored.get(serviceId)!.toJSON().translations;
    expect(translations.find((t) => t.locale === "en-US")?.name).toBe("Haircut");
  });

  it("sets an option-level translation when optionId is given", async () => {
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });
    const optionId = repo.stored.get(serviceId)!.toJSON().options[0]!.id;
    await new SetServiceTranslationCommand(repo).execute({
      requesterUserId: "user-1",
      serviceId,
      locale: "en-US",
      name: "Hair only",
      description: null,
      optionId,
    });
    const option = repo.stored.get(serviceId)!.toJSON().options[0]!;
    expect(option.translations.find((t) => t.locale === "en-US")?.name).toBe(
      "Hair only",
    );
  });

  it("refuses a stranger", async () => {
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await expect(
      new SetServiceTranslationCommand(repo).execute({
        requesterUserId: "stranger",
        serviceId,
        locale: "en-US",
        name: "Haircut",
        description: null,
      }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
    // Never got to the mutation: no en-US row was added.
    const translations = repo.stored.get(serviceId)!.toJSON().translations;
    expect(translations.find((t) => t.locale === "en-US")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The outbox — the layer `Service.pullEvents()` alone never reaches.
// `CreateServiceCommand` and `SetServiceStatusCommand` are the only two
// commands in this bounded context that raise events carrying an actor
// (`ServiceCreated`, `ServicePublished`, `ServiceUnpublished`), and until
// this round neither of them published anything: they called `repo.save()`
// and stopped, so every event `Service`'s aggregate methods pushed onto
// `_events` died with the aggregate. A test asserting only on
// `service.pullEvents()` (see `service.aggregate.test.ts`) cannot catch
// that — it never asks whether anything downstream of the command actually
// received the events. This block asks that question directly.
//
// It also asserts on `insideTransaction` and `afterSave` (see
// `TrackingUnitOfWork`/`CapturingOutbox` above): a first pass at these
// tests only checked "publish was called with the right events", which is
// exactly as true whether the publish call sits inside or outside
// `atomicExecute`, and whether it runs before or after `repo.save`. Both
// orderings look identical to a fake that just runs `work()` inline —
// which is what let a mutated command (publish moved outside the
// transaction, or moved ahead of the save but still inside it) pass all
// 132 tests in this file unchanged. The two booleans close that gap.
// ---------------------------------------------------------------------------

describe("the outbox", () => {
  it("creating a service publishes ServiceCreated with the actor on it, inside the transaction, after the save", async () => {
    await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);

    expect(outbox.published).toHaveLength(1);
    const batch = outbox.published[0]!;
    expect(batch.aggregateType).toBe("service");
    expect(batch.insideTransaction).toBe(true);
    expect(batch.afterSave).toBe(true);

    const created = batch.events.find((e) => e.eventName === "service.created");
    expect(created).toBeDefined();
    expect((created!.payload as { actorUserId: string }).actorUserId).toBe(
      base.requesterUserId,
    );
  });

  it("publishing a service publishes ServicePublished with the actor on it, inside the transaction, after the save", async () => {
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });

    await new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
      requesterUserId: "user-1",
      serviceId,
      status: "published",
    });

    // One batch from CreateServiceCommand, one from SetServiceStatusCommand
    // — both tagged "service", both actually reaching the outbox port,
    // each inside its own command's transaction and after its own save.
    expect(outbox.published).toHaveLength(2);
    expect(outbox.published.every((p) => p.aggregateType === "service")).toBe(true);
    expect(outbox.published.every((p) => p.insideTransaction)).toBe(true);
    expect(outbox.published.every((p) => p.afterSave)).toBe(true);

    const publishedEvent = outbox.published
      .flatMap((p) => p.events)
      .find((e) => e.eventName === "service.published");
    expect(publishedEvent).toBeDefined();
    expect((publishedEvent!.payload as { actorUserId: string }).actorUserId).toBe(
      "user-1",
    );
  });

  it("unpublishing a service publishes ServiceUnpublished with the actor on it", async () => {
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });
    await new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
      requesterUserId: "user-1",
      serviceId,
      status: "published",
    });

    await new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
      requesterUserId: "user-3",
      serviceId,
      status: "draft",
    });

    const unpublishBatch = outbox.published.at(-1)!;
    expect(unpublishBatch.insideTransaction).toBe(true);
    expect(unpublishBatch.afterSave).toBe(true);

    const unpublishedEvent = unpublishBatch.events.find(
      (e) => e.eventName === "service.unpublished",
    );
    expect(unpublishedEvent).toBeDefined();
    // user-3 (an admin), not user-1 who created and published it — the
    // actor is whoever performed *this* act, not the service's creator.
    expect((unpublishedEvent!.payload as { actorUserId: string }).actorUserId).toBe(
      "user-3",
    );
  });

  it("a refused status change publishes nothing — the aggregate's own invariant", async () => {
    // SERVICE_NEEDS_OPTION, thrown by `Service.publish()` itself. `user-1`
    // is the owner, so this exercises the invariant refusal specifically,
    // not authorization — the sibling test below covers that branch, which
    // this one cannot: mutation testing showed this was the only one of
    // the two refusal paths any pre-existing test caught, because both
    // `:371`/`:388`-style authz tests only ever asserted the thrown code,
    // never the outbox.
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);

    await expect(
      new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
        requesterUserId: "user-1",
        serviceId,
        status: "published",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_NEEDS_OPTION" });

    // Only the create call's batch — the refused publish attempt never
    // reached the outbox, matching `repo.save()` never being called for it
    // either.
    expect(outbox.published).toHaveLength(1);
  });

  it("a refused status change publishes nothing — authorization, not the aggregate's invariant", async () => {
    // The invariant test above (SERVICE_NEEDS_OPTION) is the one mutation
    // testing caught; a publish call added only on the authorization branch
    // — `NOT_PROVIDER_OWNER_OR_ADMIN`, thrown one line earlier for `user-2`,
    // a staff member — passed every existing test unchanged, because
    // nothing exercising that branch (the two tests at `:371`/`:388`) ever
    // looked at the outbox, only at the thrown code.
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);
    await new ManageOptionsCommand(repo).add({
      requesterUserId: "user-1",
      serviceId,
      pricingMode: "fixed",
      amountMinor: 30000,
      currency: "MZN",
      durationMinutes: 30,
      minMinutes: null,
      stepMinutes: null,
      name: "Só cabelo",
    });
    const publishedBeforeAttempt = outbox.published.length;

    await expect(
      new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
        requesterUserId: "user-2",
        serviceId,
        status: "published",
      }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_OWNER_OR_ADMIN" });

    expect(outbox.published).toHaveLength(publishedBeforeAttempt);
  });

  it("archiving publishes ServiceUpdated — the only status change with no actor-carrying event of its own", async () => {
    // `Service.archive()` raises no event of its own — but unlike a batch
    // with genuinely nothing to say, it is not empty either: `archive()`
    // still calls the aggregate's `touch()`, same as every other mutating
    // method, and `touch()` unconditionally pushes `ServiceUpdated`.
    // Confirmed directly against the aggregate before writing this
    // assertion, rather than assumed: `publish([], "service")` never
    // happens on this path. What actually distinguishes archiving from
    // publish/unpublish is that its batch carries no event with an
    // `actorUserId` — `ServiceUpdated` has none — so this is still an
    // outbox row (`insertEvents` runs, `dispatch` runs), just not one an
    // activity-feed handler will find anything to attribute in.
    const { serviceId } = await new CreateServiceCommand(repo, unitOfWork, outbox).execute(base);

    await new SetServiceStatusCommand(repo, unitOfWork, outbox).execute({
      requesterUserId: "user-1",
      serviceId,
      status: "archived",
    });

    const archiveBatch = outbox.published.at(-1)!;
    expect(archiveBatch.aggregateType).toBe("service");
    expect(archiveBatch.insideTransaction).toBe(true);
    expect(archiveBatch.afterSave).toBe(true);
    expect(archiveBatch.events.map((e) => e.eventName)).toEqual(["service.updated"]);
  });
});
