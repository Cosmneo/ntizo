import type { ProviderInvitePublicDTO } from "@ntizo/shared/read-models";

export interface InvitePublicRepositoryPort {
  /** Null for a token nobody holds — indistinguishable from a typo, on purpose. */
  findByToken(token: string): Promise<ProviderInvitePublicDTO | null>;
}
