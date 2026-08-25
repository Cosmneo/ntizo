import { sql } from "./db";
import { createVerifiedUser } from "./auth";

export interface SeedProviderInput {
  name: string;
  slug: string;
  city?: string;
  district?: string;
  country?: string;
  description?: string;
  type?: "individual" | "organization";
  status?: "active" | "inactive";
  /**
   * Owns the seeded provider. Optional: the public-directory specs don't
   * care who owns their rows, only what an anonymous visitor sees, so when
   * this is omitted a throwaway owner is created exactly as before. A spec
   * that needs the provider to show up on a *specific* signed-in user's
   * dashboard (e.g. session-isolation tests in auth.spec.ts) passes that
   * user's id here instead.
   */
  ownerUserId?: string;
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
 * user is created for each one rather than a fabricated id, unless the
 * caller already has one to attach (see `ownerUserId` on the input).
 *
 * Also inserts the matching `ntizo_provider.provider_member` row. Without
 * it the provider is invisible to its owner: `ListMyProvidersProjection` /
 * `DrizzleProviderReadRepository.listForUser`
 * (packages/backend/src/modules/ntizo/read/provider/infra/repositories/drizzle/provider-read.repository.ts)
 * — which backs `listMyProviders`, the query the dashboard's provider
 * switcher reads — joins `provider` to `provider_member` on
 * `provider_member.user_id`, not to `provider.owner_user_id`. Owning a
 * provider and being able to see it in the switcher are two different rows.
 */
export async function createProvider(input: SeedProviderInput): Promise<string> {
  const ownerId = input.ownerUserId ?? (await createVerifiedUser()).id;
  const id = crypto.randomUUID();
  await sql()`
    insert into ntizo_provider.provider
      (id, owner_user_id, type, name, slug, status, description,
       address_city, address_district, address_country, created_at, updated_at)
    values
      (${id}, ${ownerId}, ${input.type ?? "organization"}, ${input.name}, ${input.slug},
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
  const providerId = (row?.id as string | undefined) ?? id;

  // Same idempotency concern as above, this time against
  // `provider_member_provider_user_uniq` (provider_id, user_id).
  await sql()`
    insert into ntizo_provider.provider_member (id, provider_id, user_id, role, joined_at)
    values (${crypto.randomUUID()}, ${providerId}, ${ownerId}, 'owner', now())
    on conflict (provider_id, user_id) do nothing`;

  return providerId;
}
