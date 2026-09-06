/**
 * Approves a workspace the platform has left pending, through the domain.
 *
 * Not an UPDATE. `DecideProviderStatusCommand` -> `Provider.decide` is what
 * checks the move is legal (`canTransition`), stamps who decided it, and
 * emits `ProviderStatusDecided` into the outbox — which is what tells the
 * provider they are live (`ProviderVerified`, provider.event-handlers.ts) and
 * what writes the row into their activity feed. A hand-written UPDATE sets
 * the column and skips all three, leaving an approved workspace whose owner
 * was never told and whose history does not record the decision.
 *
 *   DATABASE_URL=... bun run scripts/approve-provider.ts <providerId> --by <adminUserId> [--apply]
 *
 * Without `--apply` it reports what it would do and writes nothing.
 */
import { infraStore } from "../src/shared/infrastructure/stores/infra-store";
import { bootstrapProvider } from "../src/modules/ntizo/bounded-contexts/provider/bootstrap";
import type { ExecutionContext } from "../src/shared/infrastructure/execution-context";

const [providerId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const byIndex = process.argv.indexOf("--by");
const decidedBy = byIndex === -1 ? undefined : process.argv[byIndex + 1];
const apply = process.argv.includes("--apply");

if (!providerId || !decidedBy) {
  console.error("usage: approve-provider.ts <providerId> --by <adminUserId> [--apply]");
  process.exit(1);
}

/**
 * The admin whose decision this is.
 *
 * `DecideProviderStatusCommand` requires an authenticated caller only to
 * record the id — it does not decide who may call it; that check lives at the
 * GraphQL edge (`requireAdminUserId`). Running outside the edge means the
 * caller is asserting the authority, which is why this script takes the id
 * explicitly rather than picking one.
 */
function adminCtx(userId: string): ExecutionContext {
  return {
    requester: {
      type: "authenticated",
      user: {
        userId,
        email: "",
        firstName: "",
        lastName: "",
        platformRole: "admin",
      },
    },
    metadata: { requestId: `approve-provider-${Date.now()}`, receivedAt: new Date() },
  };
}

const env = {
  STAGE: (process.env["STAGE"] ?? "dev") as never,
  LOG_LEVEL: process.env["LOG_LEVEL"] ?? "info",
  DATABASE_URL: process.env["DATABASE_URL"] ?? "",
  BETTER_AUTH_SECRET: process.env["BETTER_AUTH_SECRET"] ?? "",
  RESEND_API_KEY: process.env["RESEND_API_KEY"] ?? "",
  EMAIL_FROM: process.env["EMAIL_FROM"] ?? "",
  APP_URL: process.env["APP_URL"] ?? "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
};

await infraStore.runAsync(env, async () => {
  const { adapters, useCases } = bootstrapProvider();

  const before = await adapters.providerRepository.findById(providerId);
  if (!before) {
    console.error(`No provider with id ${providerId}`);
    process.exit(1);
  }

  console.log(`  ${before.name}  (${before.slug})`);
  console.log(`  ${before.status} -> active`);
  console.log(`  decided by ${decidedBy}`);

  if (!apply) {
    console.log("\nDry run. Nothing written. Re-run with --apply.");
    return;
  }

  await useCases.decideProviderStatus.execute(adminCtx(decidedBy), {
    providerId,
    status: "active" as never,
  });

  const after = await adapters.providerRepository.findById(providerId);
  console.log(`\nApplied. Status is now: ${after?.status}`);
  await infraStore.settleDeferredWork?.();
});

process.exit(0);
