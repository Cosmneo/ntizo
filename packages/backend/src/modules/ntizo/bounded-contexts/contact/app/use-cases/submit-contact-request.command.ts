import type { ContactRequestKind } from "@ntizo/shared";
import { ContactRequest } from "../../domain/aggregates/contact-request.aggregate";
import { ContactRateLimitedError } from "../../domain/exceptions";
import type { ContactInboxPort } from "../ports/outbound/contact-inbox.port";
import type { ContactRequestRepositoryPort } from "../ports/outbound/contact-request.repository.port";

/** Messages one address may send inside the window before being asked to wait. */
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export interface SubmitContactRequestInput {
  kind: ContactRequestKind;
  topic: string;
  name: string;
  email: string | null;
  message: string;
  locale: string;
  originPath: string | null;
  /** From the session, when there is one. Never from the form. */
  requesterUserId: string | null;
  /** From the request, for the rate limit. Never from the form. */
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Somebody wrote to us through a form.
 *
 * Three steps, in an order that matters:
 *
 * 1. **The rate limit**, counted in the table rather than in memory or a
 *    cache: a Worker isolate remembers nothing between requests, and the
 *    table already has the rows. Five an hour per address is generous for a
 *    person and useless for a script. No address in the context — which
 *    should not happen behind Cloudflare — skips the check rather than
 *    refusing everybody behind a missing header.
 * 2. **The row.** This is the whole point. Once it is written the request
 *    exists, whatever happens next.
 * 3. **The inbox**, after the write returns, and allowed to fail. A Resend
 *    outage is logged with the id and nothing else; the admin queue shows
 *    the row regardless. Not an outbox event: nothing consumes one, and
 *    at-most-once to an inbox that has a queue behind it is enough.
 */
export class SubmitContactRequestCommand {
  constructor(
    private readonly repo: ContactRequestRepositoryPort,
    private readonly inbox: ContactInboxPort,
  ) {}

  async execute(input: SubmitContactRequestInput): Promise<{ requestId: string; reference: string }> {
    if (input.ipAddress) {
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
      const recent = await this.repo.countFromIpSince(input.ipAddress, since);
      if (recent >= RATE_LIMIT_MAX) {
        throw new ContactRateLimitedError(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS / 60_000);
      }
    }

    const stored = await this.repo.insert(ContactRequest.create(input));

    try {
      await this.inbox.notify(stored);
    } catch (error) {
      console.error("[contact] the inbox could not be told about a request — it is stored and in the queue", {
        requestId: stored.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { requestId: stored.id!, reference: stored.reference };
  }
}
