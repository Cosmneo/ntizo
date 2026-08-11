import type { UserAdminDTO } from "@ntizo/shared/read-models";
import type { UserAdminRepositoryPort } from "../ports/outbound/user-admin.repository.port";

/** Hard ceiling. Nothing needs every account on the platform at once. */
export const MAX_ADMIN_USER_PAGE = 50;

export interface ListUsersForAdminInput {
  /** Absent means every role — the list's "all" state, not "none". */
  role?: string | undefined;
  search?: string | undefined;
  limit: number;
  offset: number;
}

export class ListUsersForAdminProjection {
  constructor(private readonly repo: UserAdminRepositoryPort) {}

  execute(input: ListUsersForAdminInput): Promise<UserAdminDTO[]> {
    // Clamped here rather than trusted from the schema: the schema bound is a
    // contract, this is the enforcement.
    const limit = Math.min(Math.max(input.limit, 1), MAX_ADMIN_USER_PAGE);
    const offset = Math.max(input.offset, 0);
    // Whitespace-only is no filter, not a search for spaces — a stray space
    // must not empty a list somebody is working through.
    return this.repo.listAll(
      input.role?.trim() || undefined,
      input.search?.trim() || undefined,
      limit,
      offset,
    );
  }
}
