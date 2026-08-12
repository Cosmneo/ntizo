import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";
import type { AddressProps } from "../../../../domain/value-objects/address.vo";

export interface UpdateProviderInput {
  providerId: string;
  name?: string;
  description?: string;
  /** `null` clears it; omitted leaves it alone. */
  logoKey?: string | null;
  photoKeys?: string[];
  address?: AddressProps;
  /**
   * Where this business is paid. Both together or neither — the aggregate
   * refuses half of an instruction, because a method with no number fails at
   * the moment the payout runs instead of at the moment it was entered.
   */
  payoutType?: string | null;
  payoutIdentifier?: string | null;
  /**
   * Where this workspace's wall clock runs, an IANA name. Set through the
   * availability screen; the aggregate refuses anything
   * `Intl.DateTimeFormat` does not recognise.
   */
  timezone?: string;
}

export interface UpdateProviderOutput {
  providerId: string;
}

export interface UpdateProviderPort {
  execute(
    ctx: ExecutionContext,
    input: UpdateProviderInput,
  ): Promise<UpdateProviderOutput>;
}
