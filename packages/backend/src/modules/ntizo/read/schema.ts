import { mergeGraphQLSchemas } from "@cosmneo/onion-lasagna/graphql/field";
import { providerReadSchema } from "./provider/graphql/schema/queries";
import { userReadSchema } from "./user/graphql/schema/queries";

/** The READ-side schema barrel — queries only, across all bounded contexts. */
export const readSchema = mergeGraphQLSchemas(providerReadSchema, userReadSchema);
