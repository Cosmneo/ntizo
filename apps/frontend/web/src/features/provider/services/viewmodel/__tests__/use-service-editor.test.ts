import { afterEach, describe, expect, it, vi } from "vitest";
import { saveService } from "../use-service-editor";
import * as client from "@/shared/lib/graphql/session-graphql";

afterEach(() => vi.restoreAllMocks());

/**
 * `saveService` is where a real, browser-driven verification of this task
 * caught a regression a unit test never would have without this file: the
 * create path used to forward the whole `SaveServiceInput` — including
 * `memberIds` and `skipMembers`, fields `ServiceCreateInput` does not
 * declare — straight to `createService`. GraphQL rejects undeclared input
 * fields outright, so every single create failed. These tests assert on the
 * literal shape of what reaches `sessionGraphql`, the same way
 * `provider.repository.test.ts` does, specifically so that mistake cannot
 * come back silently.
 */
describe("saveService", () => {
  it("creates with only the fields ServiceCreateInput declares — no memberIds, no skipMembers", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValueOnce({ serviceCreate: { serviceId: "svc-1" } } as never)
      .mockResolvedValueOnce({ serviceMembersSet: { ok: true } } as never);

    await saveService({
      providerId: "p1",
      categoryId: "c1",
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "priced",
      name: "Corte",
      description: null,
      memberIds: ["m1", "m2"],
      skipMembers: false,
    });

    expect(spy).toHaveBeenCalledTimes(2);
    const createVariables = spy.mock.calls[0]![1] as { input: Record<string, unknown> };
    // The exact set ServiceCreateInput declares — nothing more.
    expect(Object.keys(createVariables.input).sort()).toEqual(
      [
        "bookingMode",
        "categoryId",
        "description",
        "locationType",
        "name",
        "providerId",
        "sourceLocale",
      ].sort(),
    );
    expect(createVariables.input).not.toHaveProperty("memberIds");
    expect(createVariables.input).not.toHaveProperty("skipMembers");
    expect(createVariables.input).not.toHaveProperty("serviceId");
  });

  it("follows a create with service.members.set for an organization, using the real serviceId", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValueOnce({ serviceCreate: { serviceId: "svc-1" } } as never)
      .mockResolvedValueOnce({ serviceMembersSet: { ok: true } } as never);

    const id = await saveService({
      providerId: "p1",
      categoryId: "c1",
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "priced",
      name: "Corte",
      description: null,
      memberIds: ["m1", "m2"],
      skipMembers: false,
    });

    expect(id).toBe("svc-1");
    const setVariables = spy.mock.calls[1]![1] as { input: Record<string, unknown> };
    expect(setVariables.input).toEqual({ serviceId: "svc-1", memberIds: ["m1", "m2"] });
  });

  it("never calls service.members.set on create for an individual provider", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValueOnce({ serviceCreate: { serviceId: "svc-1" } } as never);

    await saveService({
      providerId: "p1",
      categoryId: "c1",
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "priced",
      name: "Corte",
      description: null,
      memberIds: [],
      skipMembers: true,
    });

    // Only the create call — a members.set here would either send an empty
    // list (harmless for a draft, but pointless) or, worse, race the
    // server's own auto-seeding of the creator as the sole performer.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("updates with only service.update's declared fields, then the translation, then members", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValueOnce({ serviceUpdate: { ok: true } } as never)
      .mockResolvedValueOnce({ serviceTranslationSet: { ok: true } } as never)
      .mockResolvedValueOnce({ serviceMembersSet: { ok: true } } as never);

    const id = await saveService({
      serviceId: "svc-1",
      providerId: "p1",
      categoryId: "c1",
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "priced",
      name: "Corte",
      description: "Um corte",
      memberIds: ["m1"],
      skipMembers: false,
    });

    expect(id).toBe("svc-1");
    expect(spy).toHaveBeenCalledTimes(3);
    const updateVariables = spy.mock.calls[0]![1] as { input: Record<string, unknown> };
    expect(updateVariables.input).toEqual({
      serviceId: "svc-1",
      categoryId: "c1",
      locationType: "at_provider",
    });
    const translationVariables = spy.mock.calls[1]![1] as { input: Record<string, unknown> };
    expect(translationVariables.input).toEqual({
      serviceId: "svc-1",
      locale: "pt-MZ",
      name: "Corte",
      description: "Um corte",
    });
    const membersVariables = spy.mock.calls[2]![1] as { input: Record<string, unknown> };
    expect(membersVariables.input).toEqual({ serviceId: "svc-1", memberIds: ["m1"] });
  });

  it("skips service.members.set on update for an individual provider", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValueOnce({ serviceUpdate: { ok: true } } as never)
      .mockResolvedValueOnce({ serviceTranslationSet: { ok: true } } as never);

    await saveService({
      serviceId: "svc-1",
      providerId: "p1",
      categoryId: "c1",
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "priced",
      name: "Corte",
      description: null,
      memberIds: [],
      skipMembers: true,
    });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  /**
   * The review's Finding 1: `creatorMemberId` depends on two independent
   * queries (`useAvailabilityConfig` and `useCurrentUser`). For an
   * organization, `skipMembers` is `false` as soon as the first of those
   * resolves — well before the second has necessarily pre-ticked anyone —
   * so a submit that lands in that window reaches `saveService` with
   * `memberIds: []` and `skipMembers: false`, the same shape a real "clear
   * everyone" instruction would have on update. On create there is no such
   * instruction: the server has already seeded the creator as the sole
   * performer (`CreateServiceCommand`), and an empty list here only ever
   * means "the client doesn't know yet" — never "remove them". These three
   * tests are the ones that would have caught the regression the prior
   * round's browser pass didn't exercise (it only ever submitted after both
   * queries had already settled).
   */
  it("makes no service.members.set call on create when the member list hasn't resolved yet", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValueOnce({ serviceCreate: { serviceId: "svc-1" } } as never);

    const id = await saveService({
      providerId: "p1",
      categoryId: "c1",
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "priced",
      name: "Corte",
      description: null,
      // The race: an organization (`skipMembers: false`), but
      // `useAvailabilityConfig`/`useCurrentUser` hadn't resolved by submit
      // time, so nothing got pre-ticked and nothing was checked by hand.
      memberIds: [],
      skipMembers: false,
    });

    expect(id).toBe("svc-1");
    // Only the create call. A `service.members.set` here — even with `[]` —
    // would strip the creator the server just seeded.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("creates and sends exactly one service.members.set carrying the creator once the query has resolved", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValueOnce({ serviceCreate: { serviceId: "svc-1" } } as never)
      .mockResolvedValueOnce({ serviceMembersSet: { ok: true } } as never);

    const id = await saveService({
      providerId: "p1",
      categoryId: "c1",
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "priced",
      name: "Corte",
      description: null,
      // The mirror of the case above: the queries had settled by submit
      // time, so the creator is pre-ticked.
      memberIds: ["creator-1"],
      skipMembers: false,
    });

    expect(id).toBe("svc-1");
    expect(spy).toHaveBeenCalledTimes(2);
    const setVariables = spy.mock.calls[1]![1] as { input: Record<string, unknown> };
    expect(setVariables.input).toEqual({ serviceId: "svc-1", memberIds: ["creator-1"] });
  });

  it("still sends an empty member list on update — that's a real 'nobody performs this' instruction", async () => {
    const spy = vi
      .spyOn(client, "sessionGraphql")
      .mockResolvedValueOnce({ serviceUpdate: { ok: true } } as never)
      .mockResolvedValueOnce({ serviceTranslationSet: { ok: true } } as never)
      .mockResolvedValueOnce({ serviceMembersSet: { ok: true } } as never);

    await saveService({
      serviceId: "svc-1",
      providerId: "p1",
      categoryId: "c1",
      sourceLocale: "pt-MZ",
      locationType: "at_provider",
      bookingMode: "priced",
      name: "Corte",
      description: null,
      memberIds: [],
      skipMembers: false,
    });

    expect(spy).toHaveBeenCalledTimes(3);
    const setVariables = spy.mock.calls[2]![1] as { input: Record<string, unknown> };
    expect(setVariables.input).toEqual({ serviceId: "svc-1", memberIds: [] });
  });
});
