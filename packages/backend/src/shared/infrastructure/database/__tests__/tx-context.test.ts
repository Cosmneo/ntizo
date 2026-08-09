import { describe, expect, it } from "bun:test";
import {
  hasActiveTransaction,
  runAfterCommit,
  __runWithTransactionContextForTests,
} from "../tx-context";

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
});
