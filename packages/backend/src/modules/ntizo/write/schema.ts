import { providerWriteSchema } from "./provider/graphql/schema/mutations";

/** The WRITE-side schema barrel — mutations only, across all bounded contexts. */
export const writeSchema = providerWriteSchema;
