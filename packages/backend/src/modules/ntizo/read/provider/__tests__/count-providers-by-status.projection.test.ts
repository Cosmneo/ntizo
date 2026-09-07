import { describe, expect, it } from "bun:test";
import { CountProvidersByStatusProjection } from "../app/use-cases/list-providers-for-admin.projection";
import type { ProviderAdminRepositoryPort } from "../app/ports/outbound/provider-read.repository.port";

function repoAnswering(counts: Record<string, number>): ProviderAdminRepositoryPort {
  return { countByStatus: async () => counts } as unknown as ProviderAdminRepositoryPort;
}

describe("CountProvidersByStatusProjection", () => {
  it("fills the statuses the repository is silent about with zero", async () => {
    const out = await new CountProvidersByStatusProjection(repoAnswering({ pending: 2, active: 5 })).execute();
    expect(out).toEqual({ pending: 2, active: 5, rejected: 0, suspended: 0, archived: 0 });
  });

  it("answers all zeros for an empty platform", async () => {
    const out = await new CountProvidersByStatusProjection(repoAnswering({})).execute();
    expect(out).toEqual({ pending: 0, active: 0, rejected: 0, suspended: 0, archived: 0 });
  });
});
