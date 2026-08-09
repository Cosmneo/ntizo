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
  //
  // NOTE: this module and `ntizo/drizzle.config.ts` both write to the
  // default `drizzle.__drizzle_migrations` journal table. That only works
  // because drizzle applies any migration whose content hash is absent from
  // the journal, and the two chains' hashes have never collided. It is
  // coincidental, not designed — do not rely on it, and if you add a third
  // migration chain, give it its own `migrationsTable`.
  out: "./src/modules/better-auth/infrastructure/migrations",
};
