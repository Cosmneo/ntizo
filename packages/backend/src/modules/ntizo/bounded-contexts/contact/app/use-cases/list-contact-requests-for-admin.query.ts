import type { ContactRequestKind, ContactRequestStatus } from "@ntizo/shared";
import type {
  ContactRequestAdminPage,
  ContactRequestRepositoryPort,
} from "../ports/outbound/contact-request.repository.port";

export const MAX_ADMIN_LIMIT = 100;
const DEFAULT_LIMIT = 25;

/**
 * The queue, for the screen that works it. Authorisation is the edge's job,
 * as with every other administration read here.
 */
export class ListContactRequestsForAdminQuery {
  constructor(private readonly repo: ContactRequestRepositoryPort) {}

  async execute(
    input: {
      limit?: number;
      offset?: number;
      kind?: ContactRequestKind;
      status?: ContactRequestStatus;
      search?: string;
    } = {},
  ): Promise<ContactRequestAdminPage> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_ADMIN_LIMIT);
    const offset = Math.max(input.offset ?? 0, 0);
    // An empty search is no search — see `ListReviewsForAdminQuery`.
    const search = input.search?.trim() || undefined;
    return this.repo.listForAdmin({
      limit,
      offset,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(search ? { search } : {}),
    });
  }
}
