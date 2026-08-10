import { z } from "zod";
import {
  defineQuery,
  defineGraphQLSchema,
  mergeGraphQLSchemas,
} from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { providerPublicSchema } from "./provider/graphql/schema/queries";
import { invitePublicSchema } from "./invite/graphql/schema/queries";
import { cityPublicSchema } from "./city/graphql/schema/queries";

/**
 * The PUBLIC (anonymous-tier) schema barrel.
 *
 * This is the surface an unauthenticated visitor can reach: listings, service
 * pages, anything that must render for someone with no session and be
 * cacheable. It is deliberately a *separate* barrel from `read`/`write` rather
 * than a subset of them — the private schema is session-authed end to end, and
 * a public field living inside it would be one `requireRequesterUserId` away
 * from being unreachable, or one omission away from leaking.
 *
 * **Seeded empty, on purpose.** The only thing here today is a `_health` query,
 * so the barrel type-checks and the import guard beside this file has a tree to
 * scan. The guard has to exist *before* the first real public slice: arriving
 * afterwards would make it an audit of code already written, instead of a
 * barrier the first slice is written against.
 *
 * Adding a bounded context's public surface means adding one
 * `<bc>PublicSchema` argument here and switching to `mergeGraphQLSchemas`.
 * Note the merge helper needs **two or more** arguments to select its typed
 * overload — a single-argument call widens the result to the bare config and
 * collapses the frontend's inferred method tree to `never`. `write/schema.ts`
 * sidesteps that today by re-exporting its single slice directly; do the same
 * here until there are two.
 */
const health = defineQuery({
  input: zodSchema(z.object({})),
  output: zodSchema(z.literal("ok")),
  docs: { summary: "Public schema health check", tags: ["Health"] },
});

const healthSchema = defineGraphQLSchema({ _health: health });

/**
 * `_health` stays merged rather than being dropped now that real slices exist:
 * `mergeGraphQLSchemas` needs two or more arguments to select its typed
 * overload, and a single-argument call widens the result to the bare config,
 * collapsing the frontend's inferred method tree to `never`. With two real
 * slices it is no longer load-bearing for that, but it is still the only field
 * that answers when both of them are broken.
 */
export const publicSchema = mergeGraphQLSchemas(
  healthSchema,
  providerPublicSchema,
  cityPublicSchema,
  invitePublicSchema,
);

export type PublicSchema = typeof publicSchema;
