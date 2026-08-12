import { index, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { providerMember } from "../../provider/schemas";
import { catalogSchema } from "./category.schema";
import { service } from "./service.schema";

/** Who performs which service. The index on `member_id` answers "what does this person do". */
export const serviceMember = catalogSchema.table(
  "service_member",
  {
    serviceId: uuid("service_id")
      .notNull()
      .references(() => service.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => providerMember.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.serviceId, t.memberId] }),
    index("service_member_member_idx").on(t.memberId),
  ],
);

export type ServiceMemberRecord = typeof serviceMember.$inferSelect;
