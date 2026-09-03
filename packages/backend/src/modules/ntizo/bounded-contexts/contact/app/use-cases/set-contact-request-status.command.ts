import type { ContactRequestStatus } from "@ntizo/shared";
import { ContactRequestNotFoundError } from "../../domain/exceptions";
import type { ContactRequestRepositoryPort } from "../ports/outbound/contact-request.repository.port";

/**
 * An administrator marking a request done, or taking that back.
 *
 * One command carrying the target status rather than a resolve/reopen pair,
 * for the reason `setReviewFeatured` gives about itself: two endpoints make
 * every caller ask which state it is in first, and get it wrong under a race.
 * The aggregate makes both directions idempotent, so the race is harmless.
 */
export class SetContactRequestStatusCommand {
  constructor(private readonly repo: ContactRequestRepositoryPort) {}

  async execute(input: {
    requestId: string;
    status: ContactRequestStatus;
    actorUserId: string;
  }): Promise<{ status: ContactRequestStatus }> {
    const current = await this.repo.findById(input.requestId);
    if (!current) throw new ContactRequestNotFoundError(input.requestId);

    const next =
      input.status === "resolved" ? current.resolve(new Date(), input.actorUserId) : current.reopen();
    const saved = await this.repo.saveStatus(next);
    if (!saved) throw new ContactRequestNotFoundError(input.requestId);

    return { status: next.status };
  }
}
