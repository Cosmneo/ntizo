import { describe, expect, test } from "bun:test";
import type { AvailabilityConfigDTO } from "@ntizo/shared/read-models";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import { createSchedulingReadHandlers } from "../graphql/handlers/queries.handlers";

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session", email: "a@b.c", firstName: "A", lastName: "B",
    role: "customer",
    requestId: "r1", ipAddress: null, userAgent: null,
    ...overrides,
  };
}

const config: AvailabilityConfigDTO = {
  providerId: "p1",
  timezone: "Africa/Maputo",
  members: [
    {
      memberId: "m1",
      userId: "u1",
      name: "A B",
      role: "owner",
      weekly: [],
      exceptions: [],
    },
  ],
  closures: [],
};

/**
 * A fake bootstrap that records every call so the handler's arguments — in
 * particular, that `providerId` is the only thing forwarded from `args.input`
 * and `requesterUserId` always comes from the session — can be asserted, not
 * just the outcome.
 */
function fakeBootstrap(calls: string[] = []) {
  return {
    useCases: {
      readAvailabilityConfig: {
        async execute(input: { requesterUserId: string; providerId: string }) {
          calls.push(`config:${input.providerId}:${input.requesterUserId}`);
          return config;
        },
      },
    },
  } as never;
}

function routes(calls: string[] = []) {
  return createSchedulingReadHandlers({ scheduling: fakeBootstrap(calls) });
}

function call(input: unknown, ctxOverrides: Partial<NtizoGraphqlContext> = {}, calls: string[] = []) {
  const route = routes(calls).find((r) => r.key === "availability.config");
  if (!route) throw new Error('no route registered for "availability.config"');
  return route.handler(input, ctx(ctxOverrides));
}

/** The kit carries `code` beside `message` — asserting on the message matches nothing. */
async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e && typeof e === "object" && "code" in e) return String((e as { code: unknown }).code);
    throw e;
  }
  throw new Error("expected to throw");
}

describe("createSchedulingReadHandlers", () => {
  test("the schema declares exactly the field the handler implements", () => {
    const built = routes();
    expect(Object.keys(built).length).toBe(1);
  });

  test("refuses an anonymous caller before the use case ever runs", async () => {
    const calls: string[] = [];
    expect(
      await codeOf(() => call({ providerId: "p1" }, { requesterUserId: null }, calls)),
    ).toBe("UNAUTHENTICATED");
    expect(calls).toEqual([]);
  });

  test("forwards providerId from args and requesterUserId from the session", async () => {
    const calls: string[] = [];
    const result = await call({ providerId: "p1" }, { requesterUserId: "u-session" }, calls);
    expect(result).toEqual(config);
    expect(calls).toEqual(["config:p1:u-session"]);
  });
});
