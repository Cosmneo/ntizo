import type { AddressDTO } from "@ntizo/shared";
import type { ListMyAddressesInput, ListMyAddressesPort } from "../ports/inbound";
import type { AddressReadRepositoryPort } from "../ports/outbound/address-read.repository.port";

/**
 * The caller's saved addresses.
 *
 * Takes the requester id the same way `GetCurrentUserProjection` does — the
 * arg-mapper reads it off the session, never off the args. The only
 * legitimate reader of an address list is its owner, so there is no variant
 * that takes someone else's id.
 */
export class ListMyAddressesProjection implements ListMyAddressesPort {
  constructor(private readonly repo: AddressReadRepositoryPort) {}

  async execute(input: ListMyAddressesInput): Promise<AddressDTO[]> {
    return this.repo.listForUser(input.requestedByUserId);
  }
}
