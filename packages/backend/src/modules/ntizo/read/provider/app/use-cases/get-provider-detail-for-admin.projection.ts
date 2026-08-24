import { NotFoundError } from "@cosmneo/onion-lasagna";
import type { ProviderAdminDetailDTO } from "@ntizo/shared/read-models";
import type { ProviderAdminRepositoryPort } from "../ports/outbound/provider-read.repository.port";

export interface GetProviderDetailForAdminInput {
  providerId: string;
}

export class GetProviderDetailForAdminProjection {
  constructor(private readonly repo: ProviderAdminRepositoryPort) {}

  async execute(
    input: GetProviderDetailForAdminInput,
  ): Promise<ProviderAdminDetailDTO> {
    const found = await this.repo.findDetailForAdmin(input.providerId);
    // A typed 404, not null through the schema. A nullable output would make
    // every consumer handle an absence that only ever means "stale link", and
    // the kit's error code is what turns that into a page rather than a crash.
    if (!found) {
      throw new NotFoundError({
        message: `No provider with id "${input.providerId}"`,
        code: "PROVIDER_NOT_FOUND",
      });
    }
    return found;
  }
}
