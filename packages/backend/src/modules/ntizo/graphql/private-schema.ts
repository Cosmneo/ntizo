import { mergeGraphQLSchemas } from "@cosmneo/onion-lasagna/graphql/field";
import { readSchema } from "../read/schema";
import { writeSchema } from "../write/schema";

/**
 * The PRIVATE (session-authed) client-facing schema — definitions only, no
 * handlers. This is the type the frontend GraphQL client imports to infer its
 * typed method tree (Plan 1B).
 */
export const privateGraphqlSchema = mergeGraphQLSchemas(readSchema, writeSchema);
