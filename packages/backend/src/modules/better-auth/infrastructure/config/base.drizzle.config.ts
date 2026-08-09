import type { Config } from "drizzle-kit";

export const baseDrizzleConfig: Config = {
  schema: "./src/modules/better-auth/infrastructure/database/schema.ts",
  dialect: "postgresql",
  schemaFilter: ["better_auth"],
  verbose: true,
  strict: true,
  // A migration describes how the schema evolved, not which environment it
  // runs against — so there is one migration chain per module, not one per
  // stage. `out` lives here, in the shared base config, because it must not
  // vary by stage; only `dbCredentials.url` (set per stage-config below)
  // should.
  out: "./src/modules/better-auth/infrastructure/migrations",
  // This chain gets its own journal table, distinct from
  // `ntizo/drizzle.config.ts`'s. drizzle-orm's postgres-js migrator
  // (pg-core/dialect.js, PgDialect.migrate) does NOT decide what to apply by
  // hash membership — it reads only the single most-recent row from the
  // journal table (`order by created_at desc limit 1`) and applies any
  // pending migration whose own timestamp is greater than that one row's
  // `created_at`. The `hash` column is written but never read back for this
  // decision.
  //
  // Two chains sharing one journal table are therefore order-dependent: this
  // chain's one migration was generated earlier than ntizo's, so applying
  // ntizo first leaves a journal row newer than this chain's migration, and
  // this chain's migrate run then skips it entirely — exit 0, "applied
  // successfully", `better_auth` schema never created. Confirmed empirically
  // against a from-zero database in both apply orders (see
  // packages/backend/scripts/reset-test-db.ts's header comment and Task 1's
  // report). A separate `migrationsTable` per chain removes the coupling as
  // a property of the config, rather than relying on an apply order nobody
  // enforces.
  migrations: { table: "better_auth_migrations" },
};
