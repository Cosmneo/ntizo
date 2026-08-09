import { describe, expect, it } from "bun:test";
import {
  hasActiveTransaction,
  runAfterCommit,
  runInTransaction,
  __runWithTransactionContextForTests,
} from "../tx-context";
import { getDb } from "../../../../modules/better-auth/infrastructure/client/drizzle";

describe("transaction context", () => {
  it("reports no active transaction outside one", () => {
    expect(hasActiveTransaction()).toBe(false);
  });

  it("reports an active transaction inside one", async () => {
    await __runWithTransactionContextForTests({} as never, async () => {
      expect(hasActiveTransaction()).toBe(true);
    });
  });

  it("defers after-commit callbacks until the transaction ends", async () => {
    const order: string[] = [];
    await __runWithTransactionContextForTests({} as never, async () => {
      await runAfterCommit(() => { order.push("after"); });
      order.push("inside");
    });
    expect(order).toEqual(["inside", "after"]);
  });

  it("runs an after-commit callback immediately when no transaction is active", async () => {
    const order: string[] = [];
    await runAfterCommit(() => { order.push("ran"); });
    expect(order).toEqual(["ran"]);
  });

  // A callback throwing must not surface as a failed request: the transaction
  // has already committed, so the write IS durable. Reporting failure would be
  // a lie, and aborting siblings would silently skip unrelated side-effects.
  it("isolates a throwing after-commit callback from its siblings", async () => {
    const ran: string[] = [];
    await __runWithTransactionContextForTests({} as never, async () => {
      await runAfterCommit(() => { throw new Error("boom"); });
      await runAfterCommit(() => { ran.push("second"); });
    });
    expect(ran).toEqual(["second"]);
  });

  // The whole point of this test is to fail loudly if getDb() ever reverts to
  // unconditionally returning the request-scoped client: that regression
  // would make every use case silently write outside its transaction while
  // this suite stays green.
  it("getDb() resolves the bound transaction", async () => {
    const sentinel = { marker: "tx" } as never;
    await __runWithTransactionContextForTests(sentinel, async () => {
      expect(getDb()).toBe(sentinel);
    });
  });

  it("discards the after-commit queue when work throws", async () => {
    const ran: string[] = [];
    await expect(
      __runWithTransactionContextForTests({} as never, async () => {
        await runAfterCommit(() => { ran.push("nope"); });
        throw new Error("work failed");
      }),
    ).rejects.toThrow("work failed");
    expect(ran).toEqual([]);
  });

  // runInTransaction always opens on the request client, never on
  // getActiveDb(); nested on the { max: 1 } per-request pool this hangs
  // forever with no error (queued behind a transaction that is itself
  // waiting on it), so it must refuse to be called reentrantly instead.
  it("throws when runInTransaction is called inside an active transaction", async () => {
    await __runWithTransactionContextForTests({} as never, async () => {
      await expect(runInTransaction(async () => {})).rejects.toThrow(
        "runInTransaction called inside an active transaction",
      );
    });
  });
});
