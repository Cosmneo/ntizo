import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addAddress,
  addressQueries,
  deleteAddress,
  updateAddress,
  type AddressFieldsInput,
} from "@/features/account/data/address.repository";

/** The only path from the account UI to the address data layer. */
export function useMyAddresses() {
  return useQuery(addressQueries.mine());
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
