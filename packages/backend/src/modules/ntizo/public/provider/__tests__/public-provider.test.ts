import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { providerPublicReadModel } from "@ntizo/shared/read-models";
import type { ProviderPublicDTO } from "@ntizo/shared";
import type { ProviderPublicRepositoryPort } from "../app/ports/outbound/provider-public.repository.port";
import {
  ListPublicProvidersProjection,
  MAX_PUBLIC_PAGE_SIZE,
} from "../app/use-cases/list-public-providers.projection";
import { GetPublicProviderProjection } from "../app/use-cases/get-public-provider.projection";

const dto: ProviderPublicDTO = {
  id: "p1", name: "Org", slug: "org", type: "organization",
  description: null, city: null, district: null, country: null,
};

class FakeRepo implements ProviderPublicRepositoryPort {
  public readonly calls: string[] = [];
  constructor(private readonly result: ProviderPublicDTO | null = dto) {}
  async listActive(limit: number, offset: number): Promise<ProviderPublicDTO[]> {
    this.calls.push(`listActive:${limit}:${offset}`);
    return this.result ? [this.result] : [];
  }
  async findActiveBySlug(slug: string): Promise<ProviderPublicDTO | null> {
    this.calls.push(`findActiveBySlug:${slug}`);
    return this.result;
  }
}

/**
 * These fields must never reach an anonymous caller. `ownerUserId` links a
 * business to a person; the street, postal code and coordinates are the precise
 * location of someone who may work from home.
 */
const FORBIDDEN_PUBLIC_FIELDS = [
  "ownerUserId", "owner_user_id",
  "addressStreet", "address_street",
  "addressPostalCode", "address_postal_code",
  "addressLat", "address_lat",
  "addressLng", "address_lng",
  "members", "invites",
];

describe("public provider read model", () => {
  it("declares none of the private fields", () => {
    const fields = Object.keys(providerPublicReadModel.shape);
    expect(fields.length).toBeGreaterThan(0);
    for (const forbidden of FORBIDDEN_PUBLIC_FIELDS) {
      expect(fields).not.toContain(forbidden);
    }
  });
});

/**
 * The DTO shape is a contract; the SELECT is the boundary. A repository that
 * read `*` and mapped down would satisfy the model above and leak the day
 * someone widened the mapper — so this asserts the private columns are never
 * read out of the database at all.
 */
describe("public provider repository source", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "infra", "repositories", "drizzle", "provider-public.repository.ts"),
    "utf8",
  );

  it("never selects a private column", () => {
    expect(source.length).toBeGreaterThan(0);
    for (const forbidden of ["ownerUserId", "addressStreet", "addressPostalCode", "addressLat", "addressLng"]) {
      expect(source).not.toContain(`provider.${forbidden}`);
    }
  });

  it("scopes every query to active providers", () => {
    // Two queries, two status checks. A public endpoint that returns a
    // deactivated provider defeats what deactivating is for.
    const statusChecks = source.match(/eq\(provider\.status, "active"\)/g) ?? [];
    expect(statusChecks.length).toBe(2);
  });
});

describe("ListPublicProvidersProjection", () => {
  it("clamps the page size, whatever the caller asks for", async () => {
    const repo = new FakeRepo();
    await new ListPublicProvidersProjection(repo).execute({ limit: 10_000, offset: -5 });
    expect(repo.calls).toEqual([`listActive:${MAX_PUBLIC_PAGE_SIZE}:0`]);
  });

  it("refuses a page size below one rather than passing it through", async () => {
    const repo = new FakeRepo();
    await new ListPublicProvidersProjection(repo).execute({ limit: 0, offset: 0 });
    expect(repo.calls).toEqual(["listActive:1:0"]);
  });
});

describe("GetPublicProviderProjection", () => {
  it("returns null for a slug with no active provider, rather than throwing", async () => {
    // Missing and deactivated must be indistinguishable from outside: telling
    // them apart reveals which businesses exist but are hidden.
    const result = await new GetPublicProviderProjection(new FakeRepo(null)).execute({ slug: "gone" });
    expect(result).toBeNull();
  });
});
