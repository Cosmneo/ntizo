/// <reference types="node" />
import type { Config } from "drizzle-kit";

const stage = (process.env["STAGE"] ?? "dev").toLowerCase();

const base: Config = {
  schema: "./src/modules/ntizo/shared/infrastructure/database/index.ts",
  dialect: "postgresql",
  schemaFilter: [
    "ntizo_user",
    "ntizo_provider",
    "ntizo_catalog",
    "ntizo_pricing",
    "ntizo_scheduling",
    "ntizo_booking",
    "ntizo_payment",
    "ntizo_communication",
    "ntizo_review",
    "ntizo_contact",
    "ntizo_notification",
    "ntizo_activity",
    "ntizo_outbox",
    "ntizo_reference",
    "ntizo_platform",
  ],
  verbose: true,
  strict: true,
};

const urlByStage: Record<string, string | undefined> = {
  dev: process.env["DEV_DB_URL"],
  qa: process.env["QA_DB_URL"],
  prod: process.env["PROD_DB_URL"],
};

export default {
  ...base,
  // A migration describes how the schema evolved, not which environment it
  // runs against — so there is one migration chain per module, not one per
  // stage. Only the connection URL varies by stage; `out` must not.
  out: "./src/modules/ntizo/shared/infrastructure/migrations",
  // This chain gets its own journal table, distinct from
  // `better-auth/drizzle.config.ts`'s. drizzle-orm's postgres-js migrator
  // (pg-core/dialect.js, PgDialect.migrate) does NOT decide what to apply by
  // hash membership — it reads only the single most-recent row from the
  // journal table (`order by created_at desc limit 1`) and applies any
  // pending migration whose own timestamp is greater than that one row's
  // `created_at`. The `hash` column is written but never read back for this
  // decision.
  //
  // Two chains sharing one journal table are therefore order-dependent: if
  // this chain's migrations carry a later timestamp than the other chain's
  // and this chain applies first, the other chain's migrate run finds a
  // journal row newer than its own pending migration and skips it entirely —
  // exit 0, "applied successfully", zero statements executed. Confirmed
  // empirically against a from-zero database in both apply orders (see
  // packages/backend/scripts/reset-test-db.ts's header comment and Task 1's
  // report). A separate `migrationsTable` per chain removes the coupling as
  // a property of the config, rather than relying on an apply order nobody
  // enforces.
  migrations: { table: "ntizo_migrations" },
  dbCredentials: { url: urlByStage[stage] ?? "" },
} satisfies Config;
