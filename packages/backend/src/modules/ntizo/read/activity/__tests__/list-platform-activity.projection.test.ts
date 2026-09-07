import { describe, expect, it } from "bun:test";
import { Activity } from "../../../bounded-contexts/activity/domain/aggregates/activity.aggregate";
import type { ActivityPage } from "../../../bounded-contexts/activity/app/ports/outbound/activity.repository.port";
import type { ActorReaderPort, ActorSummary } from "../app/ports/outbound/actor-reader.port";
import { ListPlatformActivityProjection } from "../app/use-cases/list-platform-activity.projection";

const at = new Date("2026-09-01T10:00:00.000Z");
const row = (id: string, actorUserId: string) =>
  Activity.rehydrate({ id, actorUserId, type: "service.published", payload: { serviceName: "Corte" }, occurredAt: at });

class FakeRepo {
  lastCall: unknown;
  constructor(private readonly page: ActivityPage = { items: [], nextCursor: null }) {}
  async listAll(p: unknown) {
    this.lastCall = p;
    return this.page;
  }
  async listForActor() {
    return { items: [], nextCursor: null };
  }
  async save() {
    return "a1";
  }
}

class FakeActors implements ActorReaderPort {
  public readonly calls: string[][] = [];
  constructor(private readonly known: Map<string, ActorSummary> = new Map()) {}
  async findActorsByIds(ids: string[]) {
    this.calls.push([...ids]);
    return this.known;
  }
}

describe("ListPlatformActivityProjection", () => {
  it("defaults and clamps the page size by the same rule as the caller's own feed", async () => {
    const repo = new FakeRepo();
    const projection = new ListPlatformActivityProjection(repo as never, new FakeActors());
    await projection.execute({});
    expect(repo.lastCall).toMatchObject({ limit: 20, cursor: null });
    await projection.execute({ limit: 5000 });
    expect(repo.lastCall).toMatchObject({ limit: 50 });
  });

  it("passes the type, the search and the cursor straight through", async () => {
    const repo = new FakeRepo();
    await new ListPlatformActivityProjection(repo as never, new FakeActors()).execute({
      type: "review.created",
      search: "Nuño",
      cursor: "2026-08-20T09:00:00.000Z|a1",
    });
    expect(repo.lastCall).toMatchObject({ type: "review.created", search: "Nuño", cursor: "2026-08-20T09:00:00.000Z|a1" });
  });

  it("names every actor from one batched read, asked once per distinct id", async () => {
    const repo = new FakeRepo({ items: [row("a1", "u1"), row("a2", "u1"), row("a3", "u2")], nextCursor: "c" });
    const actors = new FakeActors(new Map([["u1", { name: "Ana", email: "ana@x.mz" }]]));
    const page = await new ListPlatformActivityProjection(repo as never, actors).execute({});

    expect(actors.calls).toEqual([["u1", "u2"]]);
    expect(page.items.map((i) => [i.actorUserId, i.actorName, i.actorEmail])).toEqual([
      ["u1", "Ana", "ana@x.mz"],
      ["u1", "Ana", "ana@x.mz"],
      // An account the user table no longer has: the row stays, unnamed.
      ["u2", "", null],
    ]);
    expect(page.items[0]).toMatchObject({ id: "a1", type: "service.published", occurredAt: at.toISOString() });
    expect(page.nextCursor).toBe("c");
  });

  it("does not ask for actors at all on an empty page", async () => {
    const actors = new FakeActors();
    await new ListPlatformActivityProjection(new FakeRepo() as never, actors).execute({});
    expect(actors.calls).toEqual([]);
  });
});
