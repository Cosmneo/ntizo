import type { AddressDTO, CurrentUserDTO } from "@ntizo/shared";

export interface GetCurrentUserProjectionInput {
  requestedByUserId: string;
}

export interface GetCurrentUserProjectionPort {
  execute(input: GetCurrentUserProjectionInput): Promise<CurrentUserDTO>;
}

export interface ListMyAddressesInput {
  requestedByUserId: string;
}

export interface ListMyAddressesPort {
  execute(input: ListMyAddressesInput): Promise<AddressDTO[]>;
}
