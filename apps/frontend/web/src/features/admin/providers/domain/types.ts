/**
 * A provider as the administration queue sees it.
 *
 * Wider than the member-scoped summary and narrower than the workspace detail:
 * an admin deciding on an application needs what the business claims to be,
 * whose it is, and what it is being charged — and nothing about its bookings,
 * which are not what the decision turns on.
 */
export interface AdminProvider {
  id: string;
  name: string;
  slug: string;
  type: "individual" | "organization";
  status: string;
  description: string | null;
  city: string | null;
  country: string | null;
  /** Customer-side fee in basis points. The one number editable from here. */
  commissionBps: number;
  ownerEmail: string | null;
  createdAt: string;
}

/** 1250 → "12,5%". Basis points are exact; percentages are for reading. */
export function formatCommission(bps: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(bps / 10_000);
}
