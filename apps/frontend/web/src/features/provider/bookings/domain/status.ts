import type { ProviderBookingDTO } from "@ntizo/shared/read-models";

export type ProviderBookingStatus = ProviderBookingDTO["status"];
export type BadgeTone = "info" | "success" | "danger" | "warning" | "neutral";

export const PROVIDER_TABS = ["requests", "upcoming", "history"] as const;
export type ProviderTab = (typeof PROVIDER_TABS)[number];

/** The spec's chip table. Warning is reserved for the one status that is a task. */
export const STATUS_TONE: Record<ProviderBookingStatus, BadgeTone> = {
  AWAITING_PROVIDER: "warning",
  PENDING_PAYMENT: "info",
  CONFIRMED: "success",
  MARKED_DONE: "neutral",
  COMPLETED: "neutral",
  DISPUTED: "danger",
  DECLINED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
};

/** Enough to say over the phone; not a second id. */
export function shortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/** What the provider receives: the commission comes out of the payout. */
export function payoutMinor(b: { priceMinor: number; commissionMinor: number }): number {
  return b.priceMinor - b.commissionMinor;
}

export function commissionRate(bps: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(bps / 10_000);
}

export function timeLeft(deadlineIso: string, now: Date): { minutes: number; label: "hours" | "minutes" | "past" } {
  const minutes = Math.floor((new Date(deadlineIso).getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return { minutes: 0, label: "past" };
  return { minutes, label: minutes >= 60 ? "hours" : "minutes" };
}

/** "1h42" or "20 min" — the countdown wording the list and the page share. */
export function timeLeftWording(deadlineIso: string, now: Date): string | null {
  const left = timeLeft(deadlineIso, now);
  if (left.label === "past") return null;
  if (left.label === "minutes") return `${left.minutes} min`;
  const h = Math.floor(left.minutes / 60);
  const m = left.minutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** Rows per page of the provider's bookings list; the repository and the UI's pager share it. */
export const PROVIDER_BOOKINGS_PAGE_SIZE = 20;
