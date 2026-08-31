import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const platformSchema = pgSchema("ntizo_platform");

/**
 * The knobs an administrator may turn.
 *
 * Two kinds of setting live here, and every field says which it is:
 *
 *  - **seed** — copied onto a row when that row is created, and the row keeps
 *    its copy. Changing the setting affects nothing that already exists.
 *  - **live** — read at the moment of the decision, so a change applies to
 *    everyone at once.
 *
 * Mixing them without saying so is how somebody changes a live rule expecting
 * a seed and quietly rewrites the past. The commission is the reason this
 * distinction exists: a provider signed up under a rate, and moving it
 * underneath them is changing a deal they already agreed to.
 *
 * A typed single row rather than a key-value table. Key-value makes everything
 * a string, every read a parse, and every default a decision repeated at each
 * call site — and it removes the one thing a schema is for, which is refusing
 * to store nonsense.
 */
export const platformSettings = platformSchema.table("platform_settings", {
  /**
   * Always `"global"`. A single row, enforced by the primary key rather than
   * by discipline — there is one platform, and a second row would silently
   * become a second answer to every question.
   */
  id: text("id").primaryKey().default("global"),

  // ── Money ────────────────────────────────────────────────────────────────

  /**
   * SEED. The default rate deducted from the **provider's** payout, in basis
   * points, copied onto `provider.commission_bps` when a provider is created.
   *
   * The provider prices a service with this fee already in mind: the
   * customer pays exactly the listed price, and the provider receives that
   * price minus the commission. Copied at creation rather than read live so
   * a provider who signed up under one rate is not moved onto another
   * without agreeing to it — an administrator can still change a given
   * provider's own `commission_bps` afterward, which is exactly the field
   * this seed exists to initialize.
   *
   * Basis points as an integer, for the same reason money is: 1050 is 10.5%,
   * and no two machines disagree about it.
   */
  defaultCommissionBps: integer("default_commission_bps").notNull().default(1000),

  /**
   * LIVE. The floor on what a service may cost, in minor units.
   *
   * A minimum *price*, not a minimum fee. It exists to stop abusive listings
   * for a few centavos, not to make cheap work uneconomic — a 150 MT haircut
   * pays 15 MT of commission and that has to stay honest.
   */
  minServicePriceMinor: bigint("min_service_price_minor", { mode: "number" })
    .notNull()
    .default(5000),

  /**
   * LIVE. Below this, a payout costs more in gateway fees than it moves.
   */
  minPayoutMinor: bigint("min_payout_minor", { mode: "number" })
    .notNull()
    .default(10000),

  /**
   * LIVE. Days a completed booking's money waits before becoming withdrawable.
   *
   * This is what turns a wallet's pending balance into an available one. Zero
   * is a legitimate value and means "released on completion"; it is a business
   * decision about dispute risk, not a technical one.
   */
  earningsHoldDays: integer("earnings_hold_days").notNull().default(3),

  // ── Booking ──────────────────────────────────────────────────────────────

  /**
   * LIVE. Minutes an unpaid booking holds its slot before expiring.
   *
   * Read when the booking is created, so a change applies to new bookings at
   * once; bookings already made keep the deadline they were given — that is
   * the booking snapshot behaving normally (see this table's header comment
   * on seed vs. live), not a seed relationship. Was a hard-coded 30 in
   * `CreateBookingCommand`.
   *
   * The trade is real in both directions: long enough and an abandoned
   * checkout blocks a member's calendar while other customers are turned
   * away, short enough and somebody who fumbles an M-Pesa PIN loses the slot
   * they were paying for. M-Pesa's C2B is synchronous — approval takes a
   * minute or two, not half an hour — which is why the default here is 15,
   * not the mockup's 30.
   */
  paymentWindowMinutes: integer("payment_window_minutes").notNull().default(15),

  // ── Approval and verification ────────────────────────────────────────────

  /** LIVE. Whether a new workspace goes straight to active or waits in review. */
  autoApproveProviders: boolean("auto_approve_providers").notNull().default(false),

  /** LIVE. How long an invitation link works. Was hard-coded at 7. */
  inviteTtlDays: integer("invite_ttl_days").notNull().default(7),

  /** LIVE. Whether a provider must be verified before their services are listed. */
  requireDocumentsToPublish: boolean("require_documents_to_publish")
    .notNull()
    .default(true),

  // ── Content limits ───────────────────────────────────────────────────────

  /** LIVE. Was hard-coded at 24. */
  maxPortfolioPhotos: integer("max_portfolio_photos").notNull().default(24),

  /**
   * LIVE, and enforced server-side regardless of what any client believes.
   *
   * The upload routes re-check these; the values here are what they check
   * against, not a hint the browser is trusted to respect.
   */
  maxImageBytes: integer("max_image_bytes").notNull().default(5_242_880),
  maxDocumentBytes: integer("max_document_bytes").notNull().default(10_485_760),

  // ── Operations ───────────────────────────────────────────────────────────

  /** Shown to users who need help. Empty means the app shows no contact. */
  supportEmail: text("support_email").notNull().default(""),
  supportPhone: text("support_phone").notNull().default(""),

  /**
   * LIVE. A switch for closing the door without a deploy.
   *
   * Off does not hide existing providers or stop bookings — it only refuses
   * new workspaces. Anything wider than that belongs in a maintenance mode,
   * which this is not.
   */
  providerRegistrationOpen: boolean("provider_registration_open")
    .notNull()
    .default(true),

  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // A zero-minute window creates bookings that are already expired, and a
  // negative one creates bookings whose deadline is in the past — both are
  // rows the expiry sweep would delete the instant they exist, and neither
  // is a state anybody meant to configure.
  check(
    "platform_settings_payment_window_minutes_positive",
    sql`${t.paymentWindowMinutes} >= 1`,
  ),
]);

/**
 * Who changed what, when, and from what to what.
 *
 * Append-only, like the document and wallet tables and for the same reason:
 * these are decisions about other people's money and standing, and "who
 * changed the commission on this provider" has to have an answer months later.
 *
 * Values are stored as text on purpose. The point is a readable record of a
 * change, not a typed replica of every column it might describe — and a
 * typed one would need migrating every time a settable field is added.
 */
export const settingsAudit = platformSchema.table("settings_audit", {
  id: uuid("id").primaryKey().defaultRandom(),

  /** `platform` for the row above, `provider` for a per-provider override. */
  scope: text("scope").notNull(),
  /** The provider's id for a provider-scoped change; null for platform-wide. */
  targetId: uuid("target_id"),

  /** The column that moved, by name. */
  field: text("field").notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),

  /** Who did it. Not nullable: a change nobody made is a change nobody owns. */
  actorUserId: text("actor_user_id").notNull(),
  /** Optional, and worth asking for on the money fields. */
  reason: text("reason"),

  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
});
