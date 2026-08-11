import {
  bigint,
  boolean,
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
   * SEED. The platform fee charged to the **customer**, in basis points.
   *
   * Charged to the customer and never deducted from the provider — that is a
   * permanent commitment of this product, not a default. There is deliberately
   * no provider-side rate anywhere in this table, because a field is an
   * invitation and this is one nobody should be able to accept.
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
});

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
