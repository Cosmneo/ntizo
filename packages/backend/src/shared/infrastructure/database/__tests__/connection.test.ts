import { describe, expect, it } from "bun:test";
import { infraStore } from "../../stores/infra-store";

const env = {
  STAGE: "local" as const,
  LOG_LEVEL: "info",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "s",
  RESEND_API_KEY: "",
  EMAIL_FROM: "a@b.c",
  APP_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
};

describe("infraStore request scoping", () => {
  it("throws outside a request scope instead of leaking another request's env", () => {
    expect(() => infraStore.getEnv()).toThrow();
  });

  it("isolates env between concurrent scopes", async () => {
    const seen: string[] = [];
    await Promise.all([
      infraStore.runAsync({ ...env, STAGE: "dev" }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        seen.push(infraStore.getEnv().STAGE);
      }),
      infraStore.runAsync({ ...env, STAGE: "qa" }, async () => {
        seen.push(infraStore.getEnv().STAGE);
      }),
    ]);
    expect(seen.sort()).toEqual(["dev", "qa"]);
  });

  it("keeps the db connection slot per-scope", async () => {
    await infraStore.runAsync(env, async () => {
      expect(infraStore.getDbConnection()).toBeUndefined();
      infraStore.setDbConnection({
        drizzleDbClient: {} as never,
        postgresDbClient: {} as never,
      });
      expect(infraStore.getDbConnection()).toBeDefined();
    });
    // A separate scope must not see the previous scope's connection.
    await infraStore.runAsync(env, async () => {
      expect(infraStore.getDbConnection()).toBeUndefined();
    });
  });

  it("prefers the Hyperdrive connection string when the binding is present", async () => {
    await infraStore.runAsync(env, async () => {
      expect(infraStore.getConnectionString()).toBe(env.DATABASE_URL);
      infraStore.setHyperdrive({ connectionString: "postgresql://hyper/db" });
      expect(infraStore.getConnectionString()).toBe("postgresql://hyper/db");
    });
  });
});
