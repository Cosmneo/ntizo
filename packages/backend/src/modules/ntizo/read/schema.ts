import { providerReadSchema } from "./provider/graphql/schema/queries";

/** The READ-side schema barrel — queries only, across all bounded contexts. */
export const readSchema = providerReadSchema;
