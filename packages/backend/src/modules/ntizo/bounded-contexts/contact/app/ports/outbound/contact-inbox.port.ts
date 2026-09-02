import type { ContactRequest } from "../../../domain/aggregates/contact-request.aggregate";

/**
 * Tells the team a request arrived.
 *
 * Called after the row is stored, never before, and allowed to fail: the row
 * is the source of truth and the admin queue shows it regardless. See
 * `SubmitContactRequestCommand`.
 */
export interface ContactInboxPort {
  notify(request: ContactRequest): Promise<void>;
}
