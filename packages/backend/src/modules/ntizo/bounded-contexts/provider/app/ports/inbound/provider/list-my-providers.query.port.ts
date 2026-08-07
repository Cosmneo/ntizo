import type { ProviderListItemDTO } from "@ntizo/shared";
import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

export type ListMyProvidersOutput = ProviderListItemDTO[];

export interface ListMyProvidersPort {
  execute(ctx: ExecutionContext): Promise<ListMyProvidersOutput>;
}
