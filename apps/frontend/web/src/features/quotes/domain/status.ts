import type { QuoteExpiredCause, QuoteStatus } from "@ntizo/shared";

/** How many rows a quotes list asks for at a time. */
export const QUOTES_PAGE_SIZE = 20;

/**
 * Whose turn it is, as a colour.
 *
 * Amber is "the other side owes you"; navy is "your move". The same status
 * therefore reads differently on the two sides, which is the whole reason
 * there are two functions instead of one map — a customer looking at
 * `REQUESTED` is waiting on the provider, and the provider looking at that
 * same row is the one who owes an answer.
 */
export type QuoteTone = "waiting" | "yours" | "done" | "refused" | "gone";

export function customerTone(status: QuoteStatus): QuoteTone {
  switch (status) {
    case "REQUESTED": return "waiting";
    case "PROPOSED": return "yours";
    case "ACCEPTED": return "done";
    case "DECLINED":
    case "REJECTED": return "refused";
    case "WITHDRAWN":
    case "EXPIRED": return "gone";
  }
}

export function providerTone(status: QuoteStatus): QuoteTone {
  switch (status) {
    case "REQUESTED": return "yours";
    case "PROPOSED": return "waiting";
    case "ACCEPTED": return "done";
    case "DECLINED":
    case "REJECTED": return "refused";
    case "WITHDRAWN":
    case "EXPIRED": return "gone";
  }
}

/** The dot's colour. Words come from the locale, never from here. */
export const TONE_CLASS: Record<QuoteTone, string> = {
  waiting: "bg-[var(--color-warning)]",
  yours: "bg-[var(--color-primary)]",
  done: "bg-[var(--color-success)]",
  refused: "bg-[var(--color-destructive)]",
  gone: "bg-[var(--color-muted-foreground)]",
};

/**
 * What the clock line under the status says.
 *
 * A shape rather than a string, because the two sides word the same instant
 * differently and only the component knows which locale key it wants.
 */
export type QuoteClock =
  | { kind: "respondBy"; at: string }
  | { kind: "decideBy"; at: string }
  | { kind: "becameBooking" }
  | { kind: "closedReason"; reason: string }
  | { kind: "expired"; cause: QuoteExpiredCause; at: string }
  | { kind: "none" };

interface ClockSource {
  status: QuoteStatus;
  expiresAt: string | null;
  closedReason: string | null;
  expiredCause: QuoteExpiredCause | null;
  requestedAt: string;
  proposal: { validUntil: string } | null;
}

/**
 * `expires_at` carries two different clocks depending on the status — the
 * provider's window to answer while `REQUESTED`, the proposal's validity while
 * `PROPOSED` — which is exactly why the caller must not read it raw.
 */
export function clockOf(quote: ClockSource): QuoteClock {
  switch (quote.status) {
    case "REQUESTED":
      return quote.expiresAt === null ? { kind: "none" } : { kind: "respondBy", at: quote.expiresAt };
    case "PROPOSED": {
      // The proposal's own validity is the authority; the quote row mirrors it.
      const at = quote.proposal?.validUntil ?? quote.expiresAt;
      return at === null ? { kind: "none" } : { kind: "decideBy", at };
    }
    case "ACCEPTED":
      return { kind: "becameBooking" };
    case "EXPIRED":
      return quote.expiredCause === null || quote.expiresAt === null
        ? { kind: "none" }
        : { kind: "expired", cause: quote.expiredCause, at: quote.expiresAt };
    case "DECLINED":
    case "REJECTED":
    case "WITHDRAWN":
      // No closing timestamp exists on the read model — `expiresAt` on a
      // closed quote is the deadline that was still running, not the moment
      // it closed. The reason is what there is, so the reason is what is
      // said. See the Deviations section.
      return quote.closedReason === null
        ? { kind: "none" }
        : { kind: "closedReason", reason: quote.closedReason };
  }
}

const MINUTE = 60_000;
const HOUR = 3_600_000;

/**
 * A span rounded down to the unit a person would say out loud.
 *
 * Quote clocks run in days, not minutes, so the checkout countdown's `MM:SS`
 * is the wrong instrument. Hours stay hours up to two days — "faltam 26 h"
 * is more useful than "faltam 1 dia" when the deadline is tomorrow morning.
 * `null` means the span has run out, and the caller says so in its own words.
 */
export function coarseDuration(ms: number): { unit: "min" | "h" | "d"; count: number } | null {
  if (ms <= 0) return null;
  if (ms < HOUR) return { unit: "min", count: Math.floor(ms / MINUTE) };
  if (ms < 48 * HOUR) return { unit: "h", count: Math.floor(ms / HOUR) };
  return { unit: "d", count: Math.floor(ms / (24 * HOUR)) };
}

/** How many times the provider replaced their own price. A slot-taken supersession is not a revision. */
export function revisionCount(proposals: { supersededCause: string | null }[]): number {
  return proposals.filter((p) => p.supersededCause === "revised").length;
}

export function canAccept(q: { status: QuoteStatus; proposal: unknown }): boolean {
  return q.status === "PROPOSED" && q.proposal !== null;
}
export function canReject(q: { status: QuoteStatus }): boolean { return q.status === "PROPOSED"; }
export function canWithdraw(q: { status: QuoteStatus }): boolean { return q.status === "REQUESTED"; }
export function canPropose(q: { status: QuoteStatus }): boolean {
  return q.status === "REQUESTED" || q.status === "PROPOSED";
}
export function canDecline(q: { status: QuoteStatus }): boolean {
  return q.status === "REQUESTED" || q.status === "PROPOSED";
}
