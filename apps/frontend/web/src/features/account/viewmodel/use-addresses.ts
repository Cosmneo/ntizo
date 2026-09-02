import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addAddress,
  addressQueries,
  deleteAddress,
  updateAddress,
  type AddressFieldsInput,
} from "@/features/account/data/address.repository";

/**
 * The only path from the account UI to the address data layer.
 *
 * `enabled` exists for checkout's step 1, which is a **public** page: the
 * address book is a session query, and firing it for a visitor who has not
 * signed in yet buys one guaranteed `UNAUTHENTICATED` round trip and an error
 * state on a page that is only asking them to pick a time. Defaulted to true,
 * so every caller that already has a session reads exactly as before.
 */
export function useMyAddresses({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ ...addressQueries.mine(), enabled });
}

/**
 * All three writes share one invalidation, because all three can change more
 * than the row they name: adding the first address makes it the default,
 * promoting one demotes another, and deleting the default promotes a
 * survivor. Refetching the list is the only honest way to know the result.
 */
export function useAddressMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: addressQueries.mine().queryKey });

  return {
    add: useMutation({
      mutationFn: (input: AddressFieldsInput) => addAddress(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (vars: { id: string; input: Partial<AddressFieldsInput> }) =>
        updateAddress(vars.id, vars.input),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteAddress(id),
      onSuccess: invalidate,
    }),
  };
}
