import { describe, expect, it } from "bun:test";
import { ListActivityProjection } from "../app/use-cases/list-activity.projection";

class FakeRepo {
  lastCall: unknown;
  async listForActor(p: unknown) {
    this.lastCall = p;
    return { items: [], nextCursor: null };
  }
  async save() {
    return "a1";
  }
}

describe("ListActivityProjection", () => {
  it("defaults the page size rather than trusting the caller", async () => {
    const repo = new FakeRepo();
    await new ListActivityProjection(repo as never).execute({ requesterUserId: "u1" });
    expect(repo.lastCall).toMatchObject({ actorUserId: "u1", limit: 20 });
  });

  it("clamps a limit nobody should ask for", async () => {
    // A zod `.default()` does not reach the GraphQL schema — follow-up #20.
    // The clamp lives here, which is why it is tested here.
    const repo = new FakeRepo();
    await new ListActivityProjection(repo as never).execute({ requesterUserId: "u1", limit: 5000 });
    expect(repo.lastCall).toMatchObject({ limit: 50 });
  });

  it("floors a limit of zero or below to 1, rather than asking the repository for nothing", async () => {
    const repo = new FakeRepo();
    await new ListActivityProjection(repo as never).execute({ requesterUserId: "u1", limit: 0 });
    expect(repo.lastCall).toMatchObject({ limit: 1 });
  });

  it("reads only the caller's own history", async () => {
    // The actor is the session's user, never an argument. An id parameter
    // here would be an endpoint for reading anybody's history.
    const repo = new FakeRepo();
    await new ListActivityProjection(repo as never).execute({ requesterUserId: "u9" });
    expect(repo.lastCall).toMatchObject({ actorUserId: "u9" });
  });

  it("passes the caller's cursor straight through, unparsed", async () => {
    const repo = new FakeRepo();
    await new ListActivityProjection(repo as never).execute({
      requesterUserId: "u1",
      cursor: "2026-08-20T09:00:00.000Z|a1",
    });
    expect(repo.lastCall).toMatchObject({ cursor: "2026-08-20T09:00:00.000Z|a1" });
  });

  it("sends a null cursor, not undefined, when the caller gave none", async () => {
    // `ActivityRepositoryPort.listForActor`'s `cursor` is `string | null |
    // undefined` — a repo that branches on `=== null` rather than falsiness
    // would silently diverge from one that branches on `undefined`.
    const repo = new FakeRepo();
    await new ListActivityProjection(repo as never).execute({ requesterUserId: "u1" });
    expect((repo.lastCall as { cursor: unknown }).cursor).toBeNull();
  });

  it("maps a repository page into the DTO shape, ISO-stringifying occurredAt", async () => {
    class RepoWithRows {
      async listForActor() {
        return {
          items: [
            {
              id: "a1",
              type: "user.registered",
              payload: { welcomeName: "Ana" },
              occurredAt: new Date("2026-08-20T09:00:00.000Z"),
            },
          ],
          nextCursor: "2026-08-20T09:00:00.000Z|a1",
        };
      }
      async save() {
        return "a1";
      }
    }
    const result = await new ListActivityProjection(new RepoWithRows() as never).execute({
      requesterUserId: "u1",
    });
    expect(result).toEqual({
      items: [
        {
          id: "a1",
          type: "user.registered",
          payload: { welcomeName: "Ana" },
          occurredAt: "2026-08-20T09:00:00.000Z",
        },
      ],
      nextCursor: "2026-08-20T09:00:00.000Z|a1",
    });
  });
});
