import { describe, expect, it } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import type {
  ActivityPage,
  ActivityRepositoryPort,
} from "../../../bounded-contexts/activity/app/ports/outbound/activity.repository.port";
import type { Activity } from "../../../bounded-contexts/activity/domain/aggregates/activity.aggregate";
import type { ActivityType } from "../../../bounded-contexts/activity/domain/activity-type";
import { ListActivityProjection } from "../app/use-cases/list-activity.projection";
import { ListPlatformActivityProjection } from "../app/use-cases/list-platform-activity.projection";
import type { ActorReaderPort, ActorSummary } from "../app/ports/outbound/actor-reader.port";
import {
  createActivityReadHandlers,
  type ActivityReadModule,
} from "../graphql/handlers/queries.handlers";
import type { ActivityReadBootstrap } from "../bootstrap";
import { activityReadSchema, listMyActivity, listPlatformActivity } from "../graphql/schema/queries";

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

  async listAll(params: {
    limit: number;
    cursor?: string | null;
    type?: ActivityType | undefined;
    search?: string | undefined;
  }): Promise<ActivityPage> {
    this.calls.push(`listAll:${params.limit}:${params.cursor ?? "none"}:${params.type ?? "any"}:${params.search ?? "none"}`);
    return this.page;
  }
}

class FakeActorReader implements ActorReaderPort {
  async findActorsByIds(): Promise<Map<string, ActorSummary>> {
    return new Map();
  }
}

describe("the activity read schema", () => {
  it("exposes exactly two fields, which flatten to `activityMine` and `activityAll` on the wire", () => {
    // The field kit flattens a nested schema key: `{ activity: { mine } }`
    // emits on the wire as `activityMine`, not `activity.mine`. An earlier
    // phase of this project (notifications) lost a round to exactly this
    // — the frontend must call `activityMine` and `activityAll`.
    const fields = Object.keys(
      (activityReadSchema as unknown as { fields: { activity: object } }).fields.activity,
    ).sort();
    expect(fields).toEqual(["all", "mine"]);
  });

  it("the platform feed takes a type, a search and the paging — and no user id of any kind", () => {
    const adapter = listPlatformActivity.input as { _schema?: { shape?: Record<string, unknown> } };
    const shapeKeys = Object.keys(adapter._schema?.shape ?? {}).sort();
    expect(shapeKeys).toEqual(["cursor", "limit", "search", "type"]);
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
        listAll: new ListPlatformActivityProjection(repo, new FakeActorReader()),
      },
    } as ActivityReadBootstrap,
  };
}

describe("createActivityReadHandlers", () => {
  it("builds exactly two fields", () => {
    const handlers = createActivityReadHandlers(makeModule(new FakeActivityRepository()));
    expect(handlers.map((h) => h.key)).toEqual(["activity.mine", "activity.all"]);
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

/**
 * The platform feed spans every account, so it is the one field here whose
 * refusal has to be identical for everybody it refuses — the same reasoning
 * `booking.needsAttentionForAdmin`'s tests give: a refusal that varied by
 * message, by code, or by running the read first would be an oracle.
 */
describe("activity.all", () => {
  const handlerFor = (repo: FakeActivityRepository) =>
    createActivityReadHandlers(makeModule(repo)).find((h) => h.key === "activity.all")!;

  const refused = [
    { name: "a customer", over: { requesterUserId: "u-cust", role: "customer" } as const },
    { name: "a provider", over: { requesterUserId: "u-member", role: "individual_provider" } as const },
    { name: "an anonymous caller", over: { requesterUserId: null, role: "customer" } as const },
    // The half a role check alone would not have: the context schema admits
    // `role: "admin"` with a null `requesterUserId`, because an anonymous
    // request is given a role rather than none.
    { name: "an admin role with nobody behind it", over: { requesterUserId: null, role: "admin" } as const },
  ];

  for (const who of refused) {
    it(`refuses ${who.name} with ADMIN_ONLY, before the repository runs`, async () => {
      const repo = new FakeActivityRepository();
      await expect(handlerFor(repo).handler({}, ctx(who.over))).rejects.toMatchObject({ code: "ADMIN_ONLY" });
      expect(repo.calls).toEqual([]);
    });
  }

  it("refuses all four with the same message and the same code", async () => {
    const seen = new Set<string>();
    for (const who of refused) {
      const error = await handlerFor(new FakeActivityRepository())
        .handler({}, ctx(who.over))
        .then(() => null, (e: unknown) => e as { message: string; code: string });
      seen.add(`${error?.code}:${error?.message}`);
    }
    expect(seen.size).toBe(1);
  });

  it("passes the type, the search, the limit and the cursor through to the repository, for an admin", async () => {
    const repo = new FakeActivityRepository();
    await handlerFor(repo).handler(
      { type: "provider.status.decided", search: "Salão", limit: 5, cursor: "2026-08-20T09:00:00.000Z|a1" },
      ctx({ requesterUserId: "u-admin", role: "admin" }),
    );
    expect(repo.calls).toEqual(["listAll:5:2026-08-20T09:00:00.000Z|a1:provider.status.decided:Salão"]);
  });

  it("reads everybody's rows, never the caller's alone — there is no actor in the call", async () => {
    const repo = new FakeActivityRepository();
    await handlerFor(repo).handler({}, ctx({ requesterUserId: "u-admin", role: "admin" }));
    expect(repo.calls).toEqual(["listAll:20:none:any:none"]);
  });
});
