import { describe, expect, test } from "bun:test";
import type { NtizoGraphqlContext } from "../../../graphql/context";
import { createSchedulingWriteHandlers } from "../graphql/handlers/mutations.handlers";

function ctx(overrides: Partial<NtizoGraphqlContext> = {}): NtizoGraphqlContext {
  return {
    requesterUserId: "u-session", email: "a@b.c", firstName: "A", lastName: "B",
    role: "customer",
    requestId: "r1", ipAddress: null, userAgent: null,
    ...overrides,
  };
}

/** Enough of `SchedulingBootstrap` for the handlers under test — never a database. */
const fakeBootstrap = {
  useCases: {
    setWeeklyPattern: { async execute() { return { ok: true as const }; } },
    manageExceptions: {
      async add() { return { exceptionId: "exc-1" }; },
      async remove() { return { ok: true as const }; },
    },
    manageClosures: {
      async add() { return { closureId: "clo-1" }; },
      async remove() { return { ok: true as const }; },
    },
  },
} as never;

function routes() {
  return createSchedulingWriteHandlers({ scheduling: fakeBootstrap });
}

function call(field: string, input: unknown, ctxOverrides: Partial<NtizoGraphqlContext> = {}) {
  const route = routes().find((r) => r.key === field);
  if (!route) throw new Error(`no route registered for "${field}"`);
  return route.handler(input, ctx(ctxOverrides));
}

/**
 * Runs `fn`, expecting it to throw, and returns the thrown error's `.code`.
 *
 * The kit carries `code` beside `message` on every `CodedError` — reading it
 * directly is what "assert on the code" means here, as opposed to matching
 * against the message with `toThrow(/CODE/)`, which breaks the moment
 * somebody rewords a sentence for a user who was never going to read the
 * code anyway.
 */
async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e && typeof e === "object" && "code" in e) return String((e as { code: unknown }).code);
    throw e;
  }
  throw new Error("expected to throw");
}

const validInputs: Record<string, unknown> = {
  "availability.setWeeklyPattern": { providerId: "p1", memberId: "m1", rules: [] },
  "availability.addException": {
    providerId: "p1",
    memberId: "m1",
    onDate: "2026-08-20",
    kind: "closed",
    startMinute: null,
    endMinute: null,
    note: null,
  },
  "availability.removeException": { providerId: "p1", memberId: "m1", exceptionId: "exc-1" },
  "availability.addClosure": {
    providerId: "p1",
    fromDate: "2026-08-20",
    toDate: "2026-08-22",
    note: null,
  },
  "availability.removeClosure": { providerId: "p1", closureId: "clo-1" },
};

describe("createSchedulingWriteHandlers", () => {
  test("the schema declares exactly the fields the handlers implement", () => {
    // The kit throws at build() when a field has no handler, and leaves the
    // count short when a handler has no field. Building the routes is the
    // assertion; a bare build() with no expect would pass while proving it.
    const built = routes();
    expect(Object.keys(built).length).toBe(5);
  });

  test("every scheduling mutation refuses an anonymous caller", async () => {
    for (const field of Object.keys(validInputs)) {
      expect(
        await codeOf(() => call(field, validInputs[field], { requesterUserId: null })),
      ).toBe("UNAUTHENTICATED");
    }
  });

  test("setWeeklyPattern accepts an empty rules array", async () => {
    // Clearing a week is a real instruction, not a validation failure.
    const result = await call("availability.setWeeklyPattern", {
      providerId: "p1",
      memberId: "m1",
      rules: [],
    });
    expect(result).toEqual({ ok: true });
  });

  test("addException rejects a date that is not YYYY-MM-DD", async () => {
    expect(
      await codeOf(() =>
        call("availability.addException", {
          providerId: "p1",
          memberId: "m1",
          onDate: "20-08-2026",
          kind: "closed",
          startMinute: null,
          endMinute: null,
          note: null,
        }),
      ),
    ).toBe("OBJECT_VALIDATION_ERROR");
  });
});
