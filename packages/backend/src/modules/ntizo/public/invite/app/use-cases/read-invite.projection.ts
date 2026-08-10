import type { ProviderInvitePublicDTO } from "@ntizo/shared/read-models";
import type { InvitePublicRepositoryPort } from "../ports/outbound/invite-public.repository.port";

/**
 * What an invitation says about itself, to whoever holds its token.
 *
 * A projection with no logic beyond the lookup: everything interesting about
 * an invitation — whether it may still be used, whether the reader is the
 * right person — is decided by the commands, not here. This exists so the page
 * can *say* what is being joined before asking for an account.
 */
export class ReadInviteProjection {
  constructor(private readonly repo: InvitePublicRepositoryPort) {}

  async execute(input: { token: string }): Promise<ProviderInvitePublicDTO | null> {
    return this.repo.findByToken(input.token);
  }
}
