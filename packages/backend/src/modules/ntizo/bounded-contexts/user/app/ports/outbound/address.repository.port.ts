import type { Address } from "../../../domain/aggregates/address.aggregate";

/**
 * Every method takes the owner's id alongside the address id.
 *
 * Not redundant: it makes "this address belongs to this user" a condition of
 * the query rather than a check a caller has to remember. A `findById(id)`
 * would work identically for the owner and for anyone who learned the id.
 */
export interface AddressRepositoryPort {
  listByUserId(userId: string): Promise<Address[]>;
  findByIdForUser(id: string, userId: string): Promise<Address | null>;
  save(address: Address): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
  /** Clears the flag on every address of this user except `exceptId`. */
  clearDefaultForUser(userId: string, exceptId: string): Promise<void>;
}
