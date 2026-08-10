import type { ExecutionContext } from "../../../../../shared/infrastructure/execution-context";

export interface AddressFields {
  label: string;
  country: string;
  city: string;
  line1: string;
  district?: string | null;
  line2?: string | null;
  postalCode?: string | null;
  directions?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  isDefault?: boolean;
}

/**
 * Adding takes every field; updating takes any subset plus the id. Aliased
 * rather than re-declared so the two can never describe different shapes.
 */
export type AddMyAddressInput = AddressFields;

export interface UpdateMyAddressInput extends Partial<AddressFields> {
  addressId: string;
}

export interface DeleteMyAddressInput {
  addressId: string;
}

export interface AddMyAddressPort {
  execute(ctx: ExecutionContext, input: AddMyAddressInput): Promise<{ id: string }>;
}
export interface UpdateMyAddressPort {
  execute(ctx: ExecutionContext, input: UpdateMyAddressInput): Promise<void>;
}
export interface DeleteMyAddressPort {
  execute(ctx: ExecutionContext, input: DeleteMyAddressInput): Promise<void>;
}
