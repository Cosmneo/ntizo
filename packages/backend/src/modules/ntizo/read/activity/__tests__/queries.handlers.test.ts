import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type {
  ActivityPage,
  ActivityRepositoryPort,
} from "../../../bounded-contexts/activity/app/ports/outbound/activity.repository.port";
import type { Activity } from "../../../bounded-contexts/activity/domain/aggregates/activity.aggregate";
import { ListActivityProjection } from "../app/use-cases/list-activity.projection";
import {
  createActivityReadHandlers,
  type ActivityReadModule,
} from "../graphql/handlers/queries.handlers";
import type { ActivityReadBootstrap } from "../bootstrap";
import { activityReadSchema, listMyActivity } from "../graphql/schema/queries";

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session",
    email: null,
    firstName: null,
    lastName: null,
    role: "customer",
    requestId: null,
    ipAddress: null,
    userAgent: null,
    ...overrides,
  };
}

const emptyPage: ActivityPage = { items: [], nextCursor: null };

/** Every read (and the actor id it read with) is recorded, not just the outcome. */
class FakeActivityRepository implements ActivityRepositoryPort {
  public readonly calls: string[] = [];
  constructor(private readonly page: ActivityPage = emptyPage) {}

  async save(_entity: Activity): Promise<string> {
    this.calls.push("save");
    return "a-new";
  }

  async listForActor(params: {
    actorUserId: string;
    limit: number;
    cursor?: string | null;
  }): Promise<ActivityPage> {
    this.calls.push(`listForActor:${params.actorUserId}:${params.limit}:${params.cursor ?? "none"}`);
    return this.page;
  }
}

describe("the activity read schema", () => {
  it("exposes exactly one field, and it flattens to `activityMine` on the wire", () => {
    // The field kit flattens a nested schema key: `{ activity: { mine } }`
    // emits on the wire as `activityMine`, not `activity.mine`. An earlier
    // phase of this project (notifications) lost a round to exactly this
    // — Task 8's frontend must call `activityMine`.
    const fields = Object.keys(
      (activityReadSchema as unknown as { fields: { activity: object } }).fields.activity,
    ).sort();
    expect(fields).toEqual(["mine"]);
  });

  /**
   * Checked against the parsed zod shape's key set, not by slicing source
   * text — see `notification`'s equivalent test for why a text slice is
   * fragile in a way that matters here.
   */
  it("takes no user id on its input schema — the session is the answer", () => {
    const adapter = listMyActivity.input as { _schema?: { shape?: Record<string, unknown> } };
    const shapeKeys = Object.keys(adapter._schema?.shape ?? {}).sort();
    expect(shapeKeys).toEqual(["cursor", "limit"]);
  });
});

function makeModule(repo: FakeActivityRepository): ActivityReadModule {
  return {
    activityRead: {
      adapters: { repo } as never,
      useCases: {
        listMine: new ListActivityProjection(repo),
      },
    } as ActivityReadBootstrap,
  };
}

describe("createActivityReadHandlers", () => {
  it("builds exactly one field", () => {
    const handlers = createActivityReadHandlers(makeModule(new FakeActivityRepository()));
    expect(handlers.map((h) => h.key)).toEqual(["activity.mine"]);
  });

  it("refuses an anonymous caller on activity.mine before anything else runs", async () => {
    const repo = new FakeActivityRepository();
    const handlers = createActivityReadHandlers(makeModule(repo));
    const field = handlers.find((h) => h.key === "activity.mine")!;

    await expect(
      field.handler({ limit: 10 }, ctx({ requesterUserId: null })),
    ).rejects.toThrow("Sign in");

    expect(repo.calls).toEqual([]);
  });

  /**
   * The boundary the client actually talks to is the built field's
   * `.handler`, not the projection directly — a regression could leave a
   * handler reading an id off `args` while every projection test stays
   * fully green. So this exercises the real built handler with a raw args
   * object carrying an attacker-supplied id under an unrelated field name,
   * the same shape `read/notification`'s equivalent test uses.
   */
  it("stamps requesterUserId from the session, ignoring any id raw args try to smuggle in", async () => {
    const repo = new FakeActivityRepository();
    const handlers = createActivityReadHandlers(makeModule(repo));
    const field = handlers.find((h) => h.key === "activity.mine")!;

    const hostileArgs = { requesterUserId: "victim", actorUserId: "victim", limit: 5 };
    await field.handler(hostileArgs, ctx({ requesterUserId: "u-session" }));

    expect(repo.calls).toEqual(["listForActor:u-session:5:none"]);
  });

  /**
   * The property the parent task most wants verified by test rather than by
   * reading the resolver: a second user's rows never appear under the
   * first's request. There is no user-id argument to tamper with — the only
   * way to prove this is to drive the built handler with two different
   * sessions and confirm the actor id sent to the repository tracks the
   * session, never the previous call, never a shared default.
   */
  it("a second caller's session reads only that caller's own rows, never the first caller's", async () => {
    const repo = new FakeActivityRepository();
    const handlers = createActivityReadHandlers(makeModule(repo));
    const field = handlers.find((h) => h.key === "activity.mine")!;

    await field.handler({}, ctx({ requesterUserId: "user-a" }));
    await field.handler({}, ctx({ requesterUserId: "user-b" }));

    expect(repo.calls).toEqual([
      "listForActor:user-a:20:none",
      "listForActor:user-b:20:none",
    ]);
  });

  it("passes limit and cursor through to the projection", async () => {
    const repo = new FakeActivityRepository();
    const handlers = createActivityReadHandlers(makeModule(repo));
    const field = handlers.find((h) => h.key === "activity.mine")!;

    await field.handler(
      { limit: 3, cursor: "2026-08-20T09:00:00.000Z|a1" },
      ctx({ requesterUserId: "u1" }),
    );

    expect(repo.calls).toEqual(["listForActor:u1:3:2026-08-20T09:00:00.000Z|a1"]);
  });
});
