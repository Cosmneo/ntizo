/**
 * `DeferredBookingCharge` against `infraStore` for real — not a fake of it.
 *
 * This is the test the brief's own snippet had none of, and the one that
 * actually proves Task 10's ruling: that the seam `configMiddleware` already
 * wires in production (`c.executionCtx.waitUntil` → `infraStore` →
 * `connection.ts`) is what `RequestBookingChargeCommand` schedules its
 * gateway call through, and that it behaves the same way with no execution
 * context at all — the shape every test and script in this repo runs under.
 * Mirrors `notification/__tests__/deferred-delivery.test.ts`, the same proof
 * for the email path this adapter copies its shape from.
 */
import { describe, expect, it, spyOn } from "bun:test";
import { infraStore } from "../../../../../shared/infrastructure/stores/infra-store";
import type { ChargeBookingInput } from "../app/use-cases/charge-booking.command";
import type { ChargeBookingInternalPort } from "../app/ports/inbound/charge-booking.internal.command.port";
import { DeferredBookingCharge } from "../infrastructure/inbound-adapters/deferred-booking-charge.adapter";

/** `infraStore.waitUntil` needs a request scope; no field here is ever read. */
const TEST_ENV = {
  STAGE: "local" as const,
  LOG_LEVEL: "info",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "s",
  RESEND_API_KEY: "",
  EMAIL_FROM: "a@b.c",
  APP_URL: "https://ntizo.test",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
};

const INPUT: ChargeBookingInput = {
  bookingId: "bk-1",
  maxAttempts: 3,
  notAttemptedSince: new Date("2026-09-04T12:00:00.000Z"),
};

class SlowCharge implements ChargeBookingInternalPort {
  ran = false;
  constructor(private readonly outcome: "ok" | "throw" = "ok") {}
  async execute(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.ran = true;
    if (this.outcome === "throw") throw new Error("the mpesa gateway is down");
  }
}

describe("DeferredBookingCharge", () => {
  it("returns before the charge it started has finished", async () => {
    await infraStore.runAsync(TEST_ENV, async () => {
      const inner = new SlowCharge();
      await new DeferredBookingCharge(inner).execute(INPUT);
      // This is the whole point: the caller — RequestBookingChargeCommand,
      // and the request behind it — is already past it.
      expect(inner.ran).toBe(false);
      await infraStore.settleDeferredWork();
      expect(inner.ran).toBe(true);
    });
  });

  it("hands the promise to the platform's waitUntil", async () => {
    const scheduled: Promise<unknown>[] = [];
    await infraStore.runAsync(TEST_ENV, async () => {
      infraStore.setWaitUntil((p) => {
        scheduled.push(p);
      });
      await new DeferredBookingCharge(new SlowCharge()).execute(INPUT);
      expect(scheduled).toHaveLength(1);
      await infraStore.settleDeferredWork();
    });
  });

  it("logs a failed charge itself, because nobody upstream can still see it", async () => {
    // RequestBookingChargeCommand's own `await` resolved the moment this was
    // scheduled — its try/catch, if it had one, would never see this. The
    // `.catch` inside DeferredBookingCharge is the only one that can.
    const logged = spyOn(console, "error").mockImplementation(() => {});
    try {
      const scheduled: Promise<unknown>[] = [];
      await infraStore.runAsync(TEST_ENV, async () => {
        infraStore.setWaitUntil((p) => {
          scheduled.push(p);
        });
        await new DeferredBookingCharge(new SlowCharge("throw")).execute(INPUT);
        // Resolves, never rejects — a rejection reaching ctx.waitUntil is an
        // unhandled rejection in the isolate.
        await expect(Promise.all(scheduled)).resolves.toBeDefined();
      });
      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]![0]).toBe("[booking] a customer-initiated charge failed");
      expect(logged.mock.calls[0]![1]).toMatchObject({
        bookingId: "bk-1",
        error: "the mpesa gateway is down",
      });
    } finally {
      logged.mockRestore();
    }
  });

  it("still runs the work outside a Worker, where no waitUntil was registered", async () => {
    // A test, a script, `app.request()` — see `wait-until.test.ts` for the
    // same guarantee at the middleware layer. Nothing to hand the promise
    // to, but the work must still happen and must still be waitable.
    await infraStore.runAsync(TEST_ENV, async () => {
      const inner = new SlowCharge();
      await new DeferredBookingCharge(inner).execute(INPUT);
      await infraStore.settleDeferredWork();
      expect(inner.ran).toBe(true);
    });
  });
});
