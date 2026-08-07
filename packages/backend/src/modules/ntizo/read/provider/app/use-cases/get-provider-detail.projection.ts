import type { ProviderDetailDTO } from "@ntizo/shared/read-models";
import { ForbiddenError } from "@cosmneo/onion-lasagna";
import { ProviderNotFoundError } from "../../../../bounded-contexts/provider/domain/exceptions";
import type {
  GetProviderDetailProjectionInput,
  GetProviderDetailProjectionPort,
} from "../ports/inbound";
import type { ProviderReadRepositoryPort } from "../ports/outbound/provider-read.repository.port";

export class GetProviderDetailProjection implements GetProviderDetailProjectionPort {
  constructor(private readonly repo: ProviderReadRepositoryPort) {}

  async execute(
    input: GetProviderDetailProjectionInput,
  ): Promise<ProviderDetailDTO> {
    // Authorization lives in the projection, off the session-stamped id.
    const member = await this.repo.isMember(input.providerId, input.requestedByUserId);
    if (!member) {
      throw new ForbiddenError({
        message: "[read/provider] not a member of this provider",
        code: "NOT_PROVIDER_MEMBER",
      });
    }

    const detail = await this.repo.findDetailById(input.providerId);
    if (!detail) throw new ProviderNotFoundError(input.providerId);
    return detail;
  }
}
