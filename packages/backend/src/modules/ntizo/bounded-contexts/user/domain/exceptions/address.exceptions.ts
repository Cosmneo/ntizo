/**
 * Not found and not yours are the same error on purpose.
 *
 * Distinguishing them would let anyone with an id learn whether it exists by
 * reading the error text — a slow enumeration of every address on the
 * platform, one guess at a time.
 */
export class AddressNotFoundError extends Error {
  readonly code = "ADDRESS_NOT_FOUND";
  constructor(addressId: string) {
    super(`Address ${addressId} not found`);
    this.name = "AddressNotFoundError";
  }
}
