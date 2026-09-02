import { index, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "../../user/schemas/user.schema";

export const contactSchema = pgSchema("ntizo_contact");

/**
 * One message sent through the contact or feedback form.
 *
 * The row is the source of truth: the email to the team is sent after it is
 * written and may fail without losing anything (see `SubmitContactRequestCommand`).
 *
 * `kind`, `topic` and `status` are text rather than enums, like `review.status`:
 * the allowed values are the aggregate's rule (and `@ntizo/shared`'s list), and
 * a Postgres enum would make adding a topic a migration.
 *
 * `requester_user_id` and `resolved_by_user_id` are `set null` on delete:
 * deleting an account must not delete what the team was told, nor the record
 * of who resolved it — but neither may keep pointing at a row that is gone.
 *
 * `ip_address` exists for the per-IP rate limit and for abuse; the privacy
 * policy discloses it (Task 13).
 */
export const contactRequest = contactSchema.table(
  "contact_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `contact` | `feedback` — see `CONTACT_REQUEST_KINDS`. */
    kind: text("kind").notNull(),
    /** One of the kind's topics — see `CONTACT_TOPICS`. */
    topic: text("topic").notNull(),
    name: text("name").notNull(),
    /** Null only on feedback, which may arrive without a way to reply. */
    email: text("email"),
    message: text("message").notNull(),
    requesterUserId: text("requester_user_id").references(() => user.id, { onDelete: "set null" }),
    /** The UI language at submission, so the reply comes in it. */
    locale: text("locale").notNull(),
    /** The page the form was reached from; the feedback page sends it, the others do not. */
    originPath: text("origin_path"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** `open` | `resolved` — see `CONTACT_REQUEST_STATUSES`. */
    status: text("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The admin list: open first, newest first.
    index("contact_request_status_created_idx").on(t.status, t.createdAt),
    // The rate limit: "how many from this address in the last hour".
    index("contact_request_ip_created_idx").on(t.ipAddress, t.createdAt),
    index("contact_request_kind_idx").on(t.kind),
  ],
);

export type ContactRequestRecord = typeof contactRequest.$inferSelect;
export type NewContactRequestRecord = typeof contactRequest.$inferInsert;
