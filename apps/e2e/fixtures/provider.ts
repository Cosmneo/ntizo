import postgres from "postgres";
import { E2E_DB_URL } from "./db";
import { createVerifiedUser } from "./auth";

let sqlClient: postgres.Sql | undefined;
function sql(): postgres.Sql {
  sqlClient ??= postgres(E2E_DB_URL, { max: 1 });
  return sqlClient;
}

export interface SeedProviderInput {
  name: string;
  slug: string;
  city?: string;
  district?: string;
  country?: string;
  description?: string;
  type?: "individual" | "organization";
  status?: "active" | "inactive";
}

/**
 * Seeds a provider directly, bypassing the GraphQL mutation.
 *
 * The public directory tests care about what an anonymous visitor SEES, not
 * about how the row got there — and the create mutation is session-authed, so
 * driving it would mean signing a user in for every fixture row and would
 * couple these tests to the private surface they are meant to be independent
 * of. It also cannot produce an inactive provider, which one of these tests
 * needs.
 *
 * `owner_user_id` has a foreign key to ntizo_user.user, so a real verified
 * user is created for each one rather than a fabricated id.
 */
export async function createProvider(input: SeedProviderInput): Promise<string> {
  const owner = await createVerifiedUser();
  const id = crypto.randomUUID();
  await sql()`
    insert into ntizo_provider.provider
      (id, owner_user_id, type, name, slug, status, description,
       address_city, address_district, address_country, created_at, updated_at)
    values
      (${id}, ${owner.id}, ${input.type ?? "organization"}, ${input.name}, ${input.slug},
       ${input.status ?? "active"}, ${input.description ?? null},
       ${input.city ?? null}, ${input.district ?? null}, ${input.country ?? null},
       now(), now())
    on conflict (slug) do nothing`;
  // Idempotent on purpose: Playwright runs `beforeAll` once PER WORKER, and a
  // retry re-runs it too, so a plain insert collides on provider_slug_unique
  // the moment this file is not pinned to one worker. Returning the existing
  // row's id keeps the caller honest either way.
  const [row] = await sql()`
    select id from ntizo_provider.provider where slug = ${input.slug} limit 1`;
  return (row?.id as string | undefined) ?? id;
}

export async function closeProviderDb(): Promise<void> {
  await sqlClient?.end();
  sqlClient = undefined;
}
