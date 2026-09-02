import type {
  AdminReviewRow,
  ReviewRepositoryPort,
} from "../ports/outbound/review.repository.port";

/** The most one page of the administration list can pull. */
export const MAX_ADMIN_LIMIT = 100;
const DEFAULT_LIMIT = 25;

export interface AdminReviewPage {
  readonly items: AdminReviewRow[];
  readonly total: number;
  /** How many reviews are on the home page right now, across the whole table. */
  readonly featuredCount: number;
}

/**
 * Every review, for the screen that decides which of them the home page shows.
 *
 * Both statuses and every provider, which is what makes this a different query
 * from `ReadProviderReviewsQuery` rather than a parameter on it: that one is
 * the public list and must never widen. Authorisation is the edge's, as with
 * every other administration read here.
 */
export class ListReviewsForAdminQuery {
  constructor(private readonly repo: ReviewRepositoryPort) {}

  async execute(
    input: {
      limit?: number;
      offset?: number;
      featuredOnly?: boolean;
      search?: string;
    } = {},
  ): Promise<AdminReviewPage> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_ADMIN_LIMIT);
    const offset = Math.max(input.offset ?? 0, 0);
    // An empty search is no search. Passing `""` through would build a
    // `%%` pattern — harmless, but it makes every row match through four
    // ILIKEs instead of skipping the clause entirely.
    const search = input.search?.trim() || undefined;
    return this.repo.listForAdmin({
      limit,
      offset,
      featuredOnly: input.featuredOnly,
      ...(search ? { search } : {}),
    });
  }
}
