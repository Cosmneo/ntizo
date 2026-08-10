import { queryOptions } from "@tanstack/react-query";
import type { AddressDTO } from "@ntizo/shared";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";

const FIELDS =
  "id label country city district line1 line2 postalCode directions latitude longitude isDefault";

const LIST = `
  query UserMyAddresses($input: JSON!) {
    userMyAddresses(input: $input) {
      ${FIELDS}
    }
  }`;

const ADD = `
  mutation UserAddAddress($input: UserAddAddressInput!) {
    userAddAddress(input: $input) {
      id
    }
  }`;

const UPDATE = `
  mutation UserUpdateAddress($input: UserUpdateAddressInput!) {
    userUpdateAddress(input: $input) {
      ok
    }
  }`;

const DELETE = `
  mutation UserDeleteAddress($input: UserDeleteAddressInput!) {
    userDeleteAddress(input: $input) {
      ok
    }
  }`;

export interface AddressFieldsInput {
  label: string;
  country: string;
  city: string;
  line1: string;
  district?: string | null;
  line2?: string | null;
  postalCode?: string | null;
  directions?: string | null;
  isDefault?: boolean;
}

export const addressQueries = {
  /**
   * Session-scoped, so the key is not shared with anything public. Cleared
   * wholesale on sign-in and sign-out along with the rest of the session
   * cache — one user's saved addresses must never survive into another's.
   */
  mine: () =>
    queryOptions({
      queryKey: ["user", "addresses"] as const,
      queryFn: async (): Promise<AddressDTO[]> => {
        const d = await sessionGraphql<{ userMyAddresses: AddressDTO[] }>(LIST, {
          input: {},
        });
        return d.userMyAddresses;
      },
    }),
};

export async function addAddress(input: AddressFieldsInput): Promise<string> {
  const d = await sessionGraphql<{ userAddAddress: { id: string } }>(ADD, { input });
  return d.userAddAddress.id;
}

export async function updateAddress(
  addressId: string,
  input: Partial<AddressFieldsInput>,
): Promise<void> {
  await sessionGraphql<{ userUpdateAddress: { ok: boolean } }>(UPDATE, {
    input: { addressId, ...input },
  });
}

export async function deleteAddress(addressId: string): Promise<void> {
  await sessionGraphql<{ userDeleteAddress: { ok: boolean } }>(DELETE, {
    input: { addressId },
  });
}
