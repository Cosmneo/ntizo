import { describe, expect, it } from "bun:test";
import {
  hasActiveTransaction,
  __runWithTransactionContextForTests,
} from "../../database/tx-context";
import { DrizzleUnitOfWork } from "../drizzle-unit-of-work.adapter";

describe("DrizzleUnitOfWork", () => {
  it("runs the work and returns its value inside an active transaction", async () => {
    const uow = new DrizzleUnitOfWork();

    await __runWithTransactionContextForTests({} as never, async () => {
      const result = await uow.atomicExecute(async () => {
        expect(hasActiveTransaction()).toBe(true);
        return "ok";
      });
      expect(result).toBe("ok");
    });
  });

  // The property that matters: a use case's `atomicExecute` commonly wraps
  // repositories (or nested use cases) that call `ensureTransaction`
  // themselves. `__runWithTransactionContextForTests` stands in for the outer
  // transaction a top-level `atomicExecute` would have opened for real — the
  // one true open — so this needs no live database connection.
  it("nested atomicExecute joins the outer transaction instead of opening a second one", async () => {
    const uow = new DrizzleUnitOfWork();
    let transactionsOpened = 0;

    await __runWithTransactionContextForTests({} as never, async () => {
      transactionsOpened++;

      const outerResult = await uow.atomicExecute(async () => {
        expect(hasActiveTransaction()).toBe(true);

        // The nested call is the property under test. Because a transaction
        // context is already active, `ensureTransaction` must short-circuit
        // straight to `work()` instead of calling `runInTransaction` again —
        // which would try to open a real connection here (this test runs
        // outside any request scope) and, on the app's `{ max: 1 }` pool in
        // production, would deadlock instead of erroring.
        const innerResult = await uow.atomicExecute(async () => {
          expect(hasActiveTransaction()).toBe(true);
          return "inner";
        });
        expect(innerResult).toBe("inner");

        return "outer";
      });
      expect(outerResult).toBe("outer");
    });

    expect(transactionsOpened).toBe(1);
  });

  it("reports no active transaction once atomicExecute's caller unwinds", async () => {
    const uow = new DrizzleUnitOfWork();

    await __runWithTransactionContextForTests({} as never, async () => {
      await uow.atomicExecute(async () => {});
    });

    expect(hasActiveTransaction()).toBe(false);
  });
});
