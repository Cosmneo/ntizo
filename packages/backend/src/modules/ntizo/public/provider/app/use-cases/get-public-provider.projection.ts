import { DEFAULT_LOCALE } from "@ntizo/shared";
import type { ProviderPublicDTO } from "@ntizo/shared";
import type { GetPublicProviderInput, GetPublicProviderPort } from "../ports/inbound";
import type { ProviderPublicRepositoryPort } from "../ports/outbound/provider-public.repository.port";

export class GetPublicProviderProjection implements GetPublicProviderPort {
  constructor(private readonly repo: ProviderPublicRepositoryPort) {}

  /**
   * Returns null rather than throwing for a missing or inactive provider.
   *
   * The two must be indistinguishable from outside: a "not found" for one slug
   * and a "deactivated" for another tells an anonymous caller which businesses
   * exist but are hidden, which is exactly what deactivating is meant to stop.
   */
  execute(input: GetPublicProviderInput): Promise<ProviderPublicDTO | null> {
    return this.repo.findActiveBySlug(input.slug, input.locale ?? DEFAULT_LOCALE);
  }
}
