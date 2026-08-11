import {
  doublePrecision,
  integer,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "../../user/schemas/user.schema";

export const providerSchema = pgSchema("ntizo_provider");

// Provider table — represents either an individual provider (a person) or an
// organization-type provider (an establishment with multiple staff).
// Mirrors the Provider aggregate in the provider BC.
export const provider = providerSchema.table("provider", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id),
  type: text("type").notNull(), // "individual" | "organization"
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("pending"),
  description: text("description"),

  // Embedded Address VO
  /**
   * The logo, as an R2 key rather than a URL.
   *
   * A key survives the bucket moving, the public base changing and the CDN in
   * front of it changing; a stored URL survives none of those. The reader
   * composes one from `MEDIA_PUBLIC_URL_BASE`.
   */
  logoKey: text("logo_key"),

  /**
   * The portfolio, as an ordered list of R2 keys.
   *
   * On the provider rather than in its own table: they have no lifecycle of
   * their own, nothing references one individually, and order matters — which
   * an array gives for free and a table would need a column for.
   *
   * Distinct from a service's photographs, which will live with the service.
   * These answer "is this provider's work any good"; those answer "what am I
   * buying". Same medium, different question, different place.
   */
  photoKeys: text("photo_keys").array(),

  /**
   * Set when a document that had already been accepted is replaced.
   *
   * A flag rather than a status change, deliberately. Dropping the provider
   * back to `pending` would take a working business offline on suspicion, and
   * the commonest reason to re-upload an accepted ID is that the old one
   * expired. But the swap must not be invisible either — this is what puts
   * them back in front of a reviewer while they keep trading.
   *
   * Cleared when the replacement is reviewed.
   */
  reverificationRequestedAt: timestamp("reverification_requested_at", {
    withTimezone: true,
  }),

  /**
   * The platform fee charged to the **customer** on this provider's bookings,
   * in basis points.
   *
   * Copied from `platform_settings.default_commission_bps` when the workspace
   * is created and kept, so changing the platform default never moves the rate
   * under a business that already signed up. An administrator can change this
   * one; the provider cannot, and the mutation they use does not accept it.
   *
   * Charged to the customer. Never deducted from the provider — the provider
   * receives the price they quoted, and that is a permanent commitment rather
   * than a configuration.
   */
  commissionBps: integer("commission_bps").notNull().default(1000),

  /**
   * Where the platform sends this business its money.
   *
   * Two plain columns rather than a `payment_method` row, and that is a
   * deliberate narrowing: a provider has exactly one place they are paid, the
   * wizard asks for exactly one, and a table would invite a second with
   * nothing deciding which is current. If a provider ever needs several, this
   * becomes a foreign key and these become the migration's source.
   *
   * A `PaymentMethodType`, and only ever a payout-capable one — a card cannot
   * be credited, which `supportsDirection` already says and the command
   * enforces. Nullable because a provider can register and fill this in later;
   * an account with no payout details is one that cannot be paid, not one that
   * cannot exist.
   */
  payoutType: text("payout_type"),
  /**
   * The account number or phone number, as entered.
   *
   * Not a secret in the way a password is — it is what somebody prints on an
   * invoice — but it is personal financial data, so it is never in a read a
   * customer can reach and never in the public directory's projection.
   */
  payoutIdentifier: text("payout_identifier"),

  addressStreet: text("address_street"),
  addressCity: text("address_city"),
  addressDistrict: text("address_district"),
  addressCountry: text("address_country"),
  addressPostalCode: text("address_postal_code"),
  addressLat: doublePrecision("address_lat"),
  addressLng: doublePrecision("address_lng"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ProviderRow = typeof provider.$inferSelect;
export type NewProviderRow = typeof provider.$inferInsert;
