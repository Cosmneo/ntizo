import type { UserAdminDTO } from "@ntizo/shared/read-models";

/**
 * The platform-wide view of people, for the administration list.
 *
 * No requester parameter, deliberately — the answer does not vary by which
 * admin is asking, so there is nothing here to forget to check and the
 * authorisation lives at the one edge that sees the session.
 */
export interface UserAdminRepositoryPort {
  listAll(
    role: string | undefined,
    search: string | undefined,
    limit: number,
    offset: number,
  ): Promise<UserAdminDTO[]>;
  countAll(): Promise<number>;
}
