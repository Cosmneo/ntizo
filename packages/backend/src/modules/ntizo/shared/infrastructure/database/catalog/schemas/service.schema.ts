import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { catalogSchema, category } from "./category.schema";
import { provider } from "../../provider/schemas";

/**
 * Something a provider sells.
 *
 * `name` and `description` are not here — they are the provider's own words in
 * the provider's own language, and they live in `service_translation`.
 */
export const service = catalogSchema.table(
  "service",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),

    /**
     * Required. A service with no category appears in no listing and nobody
     * can tell why — the categories exist so that browsing works.
     */
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id),

    /** The locale the provider wrote in. What everything falls back to. */
    sourceLocale: text("source_locale").notNull(),

    /** A `ServiceLocationType`. */
    locationType: text("location_type").notNull(),

    /** A `ServiceBookingMode`: `priced` has options, `quote` has a form. */
    bookingMode: text("booking_mode").notNull().default("priced"),

    /** A `ServiceStatus`. */
    status: text("status").notNull().default("draft"),

    /** R2 keys, not URLs. The reader composes the URL from the public base. */
    imageKeys: text("image_keys").array(),

    sortOrder: integer("sort_order").notNull().default(0),

    /** Dead time after an appointment: cleanup, or the journey to the next address. */
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    /** The grid offered start times land on, anchored to local midnight. */
    slotIntervalMinutes: integer("slot_interval_minutes").notNull().default(30),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("service_provider_order_idx").on(t.providerId, t.sortOrder),
    // The customer's browse: published services in a category.
    index("service_status_category_idx").on(t.status, t.categoryId),
    check("service_buffer_range", sql`${t.bufferMinutes} BETWEEN 0 AND 480`),
    check("service_slot_interval", sql`${t.slotIntervalMinutes} IN (15, 30, 60)`),
  ],
);

/**
 * What a customer actually picks.
 *
 * The layer that carries the duration, which is the reason it exists: the
 * calendar reads it to cut blocks, and thirty minutes and fifty minutes
 * cannot come out of one rule.
 */
export const serviceOption = catalogSchema.table(
  "service_option",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => service.id, { onDelete: "cascade" }),

    /** A `ServicePricingMode`. */
    pricingMode: text("pricing_mode").notNull().default("fixed"),

    /** Minor units — centavos — as an integer, never a decimal or a float. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("MZN"),

    /** `fixed` only. How long this takes. */
    durationMinutes: integer("duration_minutes"),

    /** `hourly` only. The smallest booking, and what it grows by. */
    minMinutes: integer("min_minutes"),
    stepMinutes: integer("step_minutes"),

    /** The "standard" price — the one number a search card can show. */
    isDefault: boolean("is_default").notNull().default(false),

    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("service_option_service_order_idx").on(t.serviceId, t.sortOrder),
    // One default per service, enforced here rather than by discipline: the
    // search card shows one number and there has to be exactly one.
    uniqueIndex("service_option_one_default")
      .on(t.serviceId)
      .where(sql`${t.isDefault}`),
    check("service_option_amount_positive", sql`${t.amountMinor} > 0`),
    // The duration fields belong to exactly one mode. Slice 2 reads these to
    // generate blocks; a null in the wrong one generates zero-length blocks.
    check(
      "service_option_mode_fields",
      sql`(
        ${t.pricingMode} = 'fixed'
          AND ${t.durationMinutes} IS NOT NULL
          AND ${t.minMinutes} IS NULL AND ${t.stepMinutes} IS NULL
      ) OR (
        ${t.pricingMode} = 'hourly'
          AND ${t.durationMinutes} IS NULL
          AND ${t.minMinutes} IS NOT NULL AND ${t.stepMinutes} IS NOT NULL
      )`,
    ),
    check(
      "service_option_durations_positive",
      sql`(${t.durationMinutes} IS NULL OR ${t.durationMinutes} > 0)
        AND (${t.minMinutes} IS NULL OR ${t.minMinutes} > 0)
        AND (${t.stepMinutes} IS NULL OR ${t.stepMinutes} > 0)`,
    ),
  ],
);

/**
 * What to ask a customer who wants a quote.
 *
 * This table describes the *form*. Everything that happens after they press
 * send — the proposal, the acceptance, the payment — is slice 3.
 */
export const serviceQuoteForm = catalogSchema.table("service_quote_form", {
  serviceId: uuid("service_id")
    .primaryKey()
    .references(() => service.id, { onDelete: "cascade" }),

  /** What the provider commits to. The mockup says 48. */
  responseHours: integer("response_hours").notNull().default(48),

  askDeadline: boolean("ask_deadline").notNull().default(true),
  askPhotos: boolean("ask_photos").notNull().default(true),
  askLocation: boolean("ask_location").notNull().default(true),

  /** One line above the form, in the service's `source_locale`. */
  intro: text("intro"),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * A service in one language.
 *
 * Its own table rather than one polymorphic `translation(entity_type, …)`: a
 * polymorphic table cannot carry a foreign key, and a row orphaned by a
 * deleted service stays for ever.
 */
export const serviceTranslation = catalogSchema.table(
  "service_translation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => service.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("service_translation_unique").on(t.serviceId, t.locale),
    index("service_translation_locale_idx").on(t.locale),
  ],
);

export const serviceOptionTranslation = catalogSchema.table(
  "service_option_translation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    optionId: uuid("option_id")
      .notNull()
      .references(() => serviceOption.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("service_option_translation_unique").on(t.optionId, t.locale),
  ],
);

export type ServiceRow = typeof service.$inferSelect;
export type NewServiceRow = typeof service.$inferInsert;
export type ServiceOptionRow = typeof serviceOption.$inferSelect;
export type NewServiceOptionRow = typeof serviceOption.$inferInsert;
