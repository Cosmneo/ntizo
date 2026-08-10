import type { AddressDTO } from "@ntizo/shared";

export interface AddressReadRepositoryPort {
  /** The caller's own addresses. There is no variant that reads someone else's. */
  listForUser(userId: string): Promise<AddressDTO[]>;
}
