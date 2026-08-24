import {
  boolean,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const catalogSchema = pgSchema("ntizo_catalog");

/**
 * A kind of work, as the platform organises it.
 *
 * Everything here is language-independent on purpose — the names live one
 * table down. What a category *is* does not change with who is reading it;
 * only what it is called does.
 */
export const category = catalogSchema.table(
  "category",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * The stable handle: `plumbing`, `electrical`. Lowercase, no spaces.
     *
     * This is what appears in a URL and what any code that needs to mean a
     * particular category refers to. Deliberately not the name and not derived
     * from it: a customer switching language must stay on the page they were
     * on, and a translated slug would change the address underneath them —
     * and break every link anybody had already shared.
     */
    code: text("code").notNull(),

    /**
     * The image, one for every language.
     *
     * A photograph of a kitchen means the same thing in Portuguese and in
     * German. Per-locale artwork only earns its keep when the image carries
     * words, which a category tile should not; where one ever does, the
     * override belongs on the translation row.
     */
    imageKey: text("image_key"),

    /** Lucide icon name, for the places too small to carry the image. */
    icon: text("icon"),

    /**
     * Where it sits in a list a person reads.
     *
     * Ordering alphabetically would reorder the whole home page every time
     * somebody changes language — the eight tiles are a layout, not an index.
     */
    sortOrder: integer("sort_order").notNull().default(0),

    /**
     * Whether customers see it. Retiring a category must not delete it:
     * services and bookings point at it, and their history has to keep
     * meaning what it meant.
     */
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("category_code_unique").on(t.code),
    // The customer-facing read: active categories in display order.
    index("category_active_order_idx").on(t.isActive, t.sortOrder),
  ],
);

/**
 * What a category is called, in one language.
 *
 * A row per (category, locale) rather than a column per language: a ninth
 * locale is an insert instead of a migration, and "which categories have no
 * French yet" is a query rather than a scan of eight sparse columns.
 *
 * Only the default locale is required, and that requirement lives in the
 * command rather than in a constraint — the database cannot express "at least
 * one row, and it must be this one" without a trigger, and the aggregate is
 * where the rule is readable.
 */
export const categoryTranslation = catalogSchema.table(
  "category_translation",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),

    /** A tag from the product's `LOCALES`, e.g. `pt-MZ`. */
    locale: text("locale").notNull(),

    name: text("name").notNull(),

    /** One line under the name, where a screen has room for it. */
    description: text("description"),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One name per language per category. Without this, saving twice quietly
    // leaves two French names and the list picks whichever comes back first.
    uniqueIndex("category_translation_unique").on(t.categoryId, t.locale),
    // The read path: every translation for a locale, joined to the categories.
    index("category_translation_locale_idx").on(t.locale),
  ],
);
