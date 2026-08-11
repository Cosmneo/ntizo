import { z } from "zod";

/**
 * A workspace's money, in minor units.
 *
 * Integers, never decimals: `1 500,55 MT` is 150055 and no arithmetic on it
 * can drift. The currency travels with the numbers because formatting is the
 * reader's job and a bare integer is not enough to do it.
 */
export const walletReadModel = z.object({
  currency: z.string(),
  /** Withdrawable now. */
  availableMinor: z.number().int(),
  /** Earned but still held — a booking that has not been released yet. */
  pendingMinor: z.number().int(),
});

/**
 * One line of the ledger.
 *
 * `amountMinor` is what the entry is *about* and is always positive;
 * the deltas are what it moved and are signed. Cash settled outside the
 * platform is the case that needs both: an amount of the full price and
 * deltas of zero, so "you earned this" is true while "you can withdraw this"
 * stays false.
 */
export const walletEntryReadModel = z.object({
  id: z.string().min(1),
  type: z.string(),
  amountMinor: z.number().int(),
  availableDeltaMinor: z.number().int(),
  pendingDeltaMinor: z.number().int(),
  balanceAfterMinor: z.number().int(),
  currency: z.string(),
  description: z.string().nullable(),
  bookingId: z.string().nullable(),
  createdAt: z.string(),
});

export const walletWithHistoryReadModel = z.object({
  wallet: walletReadModel,
  entries: z.array(walletEntryReadModel),
  /** Where the next page starts, or null at the end. */
  nextOffset: z.number().int().nullable(),
});

export type WalletDTO = z.infer<typeof walletReadModel>;
export type WalletEntryDTO = z.infer<typeof walletEntryReadModel>;
export type WalletWithHistoryDTO = z.infer<typeof walletWithHistoryReadModel>;
