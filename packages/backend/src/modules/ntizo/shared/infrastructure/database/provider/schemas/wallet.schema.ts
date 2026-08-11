import {
  bigint,
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { providerSchema } from "./provider.schema";
import { provider } from "./provider.schema";

/**
 * A provider's money, and every movement of it.
 *
 * Ntizo owns this rather than delegating it, and that is forced by the market
 * rather than chosen: the reference project asks Stripe for a connected
 * account's balance, but M-Pesa and e-Mola have no Connect equivalent. The
 * platform receives the customer's payment and holds it until the provider is
 * paid out, so the platform is the one that must be able to say what it holds
 * and why.
 */

/**
 * One per provider, created with the workspace.
 *
 * Created up front so there is never a "provider without a wallet" branch to
 * write later — the first payment finds somewhere to land.
 *
 * Both balances are a *cache*. The entries below are the record; these columns
 * exist so a dashboard does not sum a hundred thousand rows, and they are only
 * ever written in the same transaction as the entry that moved them. A
 * discrepancy between the two is a bug you can find, which is the whole reason
 * for not making the balance the truth.
 */
export const wallet = providerSchema.table(
  "wallet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),

    /**
     * ISO 4217. One currency per wallet, never mixed.
     *
     * A wallet holding two currencies cannot have a balance — only a pair of
     * them — and every question asked of it becomes ambiguous. A provider
     * trading in a second currency gets a second wallet.
     */
    currency: text("currency").notNull().default("MZN"),

    /**
     * Minor units — centavos — as an integer, never a decimal or a float.
     *
     * `bigint` because cents overflow an `int` at ~21 million MZN, which a
     * marketplace reaches, and because a currency with no minor unit would
     * otherwise need a different column type.
     */
    availableMinor: bigint("available_minor", { mode: "number" })
      .notNull()
      .default(0),

    /**
     * Earned but not yet withdrawable — a booking paid for and not yet
     * delivered.
     *
     * Separate from available because one number would tell a provider they
     * have money they cannot take, and they would try, and the refusal would
     * look like a bug rather than a rule.
     */
    pendingMinor: bigint("pending_minor", { mode: "number" }).notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("wallet_provider_unique").on(table.providerId)],
);

/**
 * Every movement, append-only.
 *
 * Nothing here is ever updated or deleted. A refund is a new entry that moves
 * money the other way, not an edit of the entry that brought it in — the same
 * rule as the document table, for the same reason: what actually happened has
 * to survive what happened next.
 */
export const walletEntry = providerSchema.table(
  "wallet_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallet.id, { onDelete: "cascade" }),

    /** A `WalletEntryType`. Text, like every other enum in this schema. */
    type: text("type").notNull(),

    /**
     * What the entry is *about*, always positive.
     *
     * Distinct from the deltas below, and that distinction is what lets cash
     * be recorded honestly: a booking settled in notes has an amount of the
     * full price and deltas of zero, so "you earned 1 500 MT" is true while
     * "you can withdraw 1 500 MT" stays false.
     */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),

    /**
     * Signed movements. The balance is their sum, by definition.
     *
     * Two deltas rather than a direction flag because one entry legitimately
     * moves both: releasing a completed booking is pending −X and available
     * +X, which is one event and should be one row.
     */
    availableDeltaMinor: bigint("available_delta_minor", { mode: "number" })
      .notNull()
      .default(0),
    pendingDeltaMinor: bigint("pending_delta_minor", { mode: "number" })
      .notNull()
      .default(0),

    currency: text("currency").notNull(),

    /**
     * The running available balance immediately after this entry.
     *
     * Redundant on purpose. It is what turns "the numbers disagree" into "they
     * diverged at 14:32 on this entry", and reconstructing it afterwards from
     * an ordering that was never guaranteed is not the same thing.
     */
    balanceAfterMinor: bigint("balance_after_minor", { mode: "number" }).notNull(),

    /** What this was for. Null where it is not a booking — a manual adjustment. */
    bookingId: uuid("booking_id"),
    payoutId: uuid("payout_id"),

    /**
     * The one thing standing between a retried gateway callback and paying
     * somebody twice.
     *
     * M-Pesa and e-Mola retry. Unique per wallet, so the second delivery of
     * the same event is a constraint violation the caller can swallow rather
     * than a second credit nobody notices until reconciliation.
     */
    idempotencyKey: text("idempotency_key").notNull(),

    /** Shown to the provider, so it has to read like a sentence, not a code. */
    description: text("description"),

    /**
     * When the money actually moved, which is not when the row was written —
     * a gateway callback can arrive hours late, and a statement ordered by
     * insert time would then be wrong.
     */
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wallet_entry_idempotency_unique").on(
      table.walletId,
      table.idempotencyKey,
    ),
    // The statement: one wallet, newest first.
    index("wallet_entry_wallet_idx").on(table.walletId, table.occurredAt),
    // "Everything about this booking", for support and for reconciliation.
    index("wallet_entry_booking_idx").on(table.bookingId),
  ],
);
