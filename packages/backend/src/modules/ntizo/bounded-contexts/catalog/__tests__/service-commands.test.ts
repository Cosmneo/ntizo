import { beforeEach, describe, expect, it } from "bun:test";
import { Service } from "../domain/aggregates/service.aggregate";
import { CreateServiceCommand } from "../app/use-cases/create-service.command";
import { UpdateServiceCommand } from "../app/use-cases/update-service.command";
import { ManageOptionsCommand } from "../app/use-cases/manage-options.command";
import { SetServiceStatusCommand } from "../app/use-cases/set-service-status.command";
import { SetServiceTranslationCommand } from "../app/use-cases/set-service-translation.command";
import type { ServiceRepositoryPort } from "../app/ports/outbound/service.repository.port";

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

  async findById(id: string) { return this.stored.get(id) ?? null; }
  async save(s: Service) { this.saved.push(s); this.stored.set(s.id, s); }
  async delete(id: string) { this.stored.delete(id); }
  async isProviderMember(providerId: string, userId: string) {
    return this.members.has(`${providerId}:${userId}`);
  }
  async isProviderOwnerOrAdmin(providerId: string, userId: string) {
    const role = this.roles.get(`${providerId}:${userId}`);
    return role === "owner" || role === "admin";
  }
  async memberBelongsToProvider(): Promise<boolean> {
    throw new Error("not used by these tests — set members directly on the aggregate");
  }
  async unpublishServicesWithoutMembers(): Promise<{ serviceId: string; name: string }[]> {
    throw new Error("not used by these tests");
  }
}

let repo: FakeRepo;
beforeEach(() => { repo = new FakeRepo(); });

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
    const out = await new CreateServiceCommand(repo).execute(base);
    expect(out.serviceId).toBeTruthy();
    expect(repo.saved[0]!.toJSON().status).toBe("draft");
  });

  it("refuses somebody who does not belong to the workspace", async () => {
    await expect(
      new CreateServiceCommand(repo).execute({ ...base, requesterUserId: "stranger" }),
    ).rejects.toMatchObject({ code: "NOT_PROVIDER_MEMBER" });
    expect(repo.saved).toHaveLength(0);
  });

  it("gives a quote service its form and no options", async () => {
    const out = await new CreateServiceCommand(repo).execute({ ...base, bookingMode: "quote" });
    const json = repo.stored.get(out.serviceId)!.toJSON();
    expect(json.quoteForm?.responseHours).toBe(48);
    expect(json.options).toEqual([]);
  });
});

describe("ManageOptionsCommand", () => {
  async function withService() {
    const out = await new CreateServiceCommand(repo).execute(base);
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
    const { serviceId } = await new CreateServiceCommand(repo).execute(base);
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
    const { serviceId } = await new CreateServiceCommand(repo).execute(base);
    // A performer, so this isolates the option check this test is named
    // for from the member check `canPublish` now runs first.
    repo.stored.get(serviceId)!.setMembers(["member-1"]);
    await expect(
      new SetServiceStatusCommand(repo).execute({
        requesterUserId: "user-1",
        serviceId,
        status: "published",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_NEEDS_OPTION" });
  });

  it("refuses to publish a service with nobody performing it", async () => {
    const { serviceId } = await new CreateServiceCommand(repo).execute(base);
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
    await expect(
      new SetServiceStatusCommand(repo).execute({
        requesterUserId: "user-1",
        serviceId,
        status: "published",
      }),
    ).rejects.toMatchObject({ code: "SERVICE_NEEDS_MEMBER" });
  });

  it("refuses a stranger trying to change status", async () => {
    const { serviceId } = await new CreateServiceCommand(repo).execute(base);
    await expect(
      new SetServiceStatusCommand(repo).execute({
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
      new SetServiceStatusCommand(repo).execute({
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
    await new SetServiceStatusCommand(repo).execute({
      requesterUserId: "user-1",
      serviceId,
      status: "published",
    });
    expect(repo.stored.get(serviceId)!.toJSON().status).toBe("published");
  });

  it("lets an admin publish", async () => {
    const serviceId = await withOption();
    await new SetServiceStatusCommand(repo).execute({
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
    const { serviceId } = await new CreateServiceCommand(repo).execute(base);
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
    const { serviceId } = await new CreateServiceCommand(repo).execute(base);
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
    const { serviceId } = await new CreateServiceCommand(repo).execute(base);
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
    const { serviceId } = await new CreateServiceCommand(repo).execute(base);
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
    const { serviceId } = await new CreateServiceCommand(repo).execute(base);
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
    const { serviceId } = await new CreateServiceCommand(repo).execute(base);
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
    const { serviceId } = await new CreateServiceCommand(repo).execute(base);
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
