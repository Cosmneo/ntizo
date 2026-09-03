import { mergeGraphQLSchemas } from "@cosmneo/onion-lasagna/graphql/field";
import { providerWriteSchema } from "./provider/graphql/schema/mutations";
import { userWriteSchema } from "./user/graphql/schema/mutations";
import { catalogWriteSchema } from "./catalog/graphql/schema/mutations";
import { schedulingWriteSchema } from "./scheduling/graphql/schema/mutations";
import { reviewWriteSchema } from "./review/graphql/schema/mutations";
import { notificationWriteSchema } from "./notification/graphql/schema/mutations";
import { communicationWriteSchema } from "./communication/graphql/schema/mutations";
import { bookingWriteSchema } from "./booking/graphql/schema/mutations";
import { supportWriteSchema } from "./support/graphql/schema/mutations";

/** The WRITE-side schema barrel — mutations only, across all bounded contexts. */
export const writeSchema = mergeGraphQLSchemas(
  providerWriteSchema,
  userWriteSchema,
  catalogWriteSchema,
  schedulingWriteSchema,
  reviewWriteSchema,
  notificationWriteSchema,
  communicationWriteSchema,
  bookingWriteSchema,
  supportWriteSchema,
);
