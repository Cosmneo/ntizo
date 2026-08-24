import { mergeGraphQLSchemas } from "@cosmneo/onion-lasagna/graphql/field";
import { providerReadSchema } from "./provider/graphql/schema/queries";
import { userReadSchema } from "./user/graphql/schema/queries";
import { catalogReadSchema } from "./catalog/graphql/schema/queries";
import { walletReadSchema } from "./wallet/graphql/schema/queries";
import { availabilityReadSchema } from "./scheduling/graphql/schema/queries";
import { notificationReadSchema } from "./notification/graphql/schema/queries";

/** The READ-side schema barrel — queries only, across all bounded contexts. */
export const readSchema = mergeGraphQLSchemas(
  providerReadSchema,
  userReadSchema,
  catalogReadSchema,
  walletReadSchema,
  availabilityReadSchema,
  notificationReadSchema,
);
