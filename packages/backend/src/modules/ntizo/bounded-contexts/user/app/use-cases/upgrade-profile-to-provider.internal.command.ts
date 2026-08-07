import type { UserRepositoryPort } from "../ports/outbound";
import type {
  UpgradeProfileToProviderInternalPort,
  UpgradeProfileToProviderInternalInput,
} from "../ports/inbound/upgrade-profile-to-provider.internal.command.port";

/**
 * INTERNAL command — invoked by orchestration workflows only (e.g. the
 * register-user-as-provider saga). No ExecutionContext / authorize() check:
 * the caller upstream has already performed authorization.
 */
export class UpgradeProfileToProviderInternalCommand
  implements UpgradeProfileToProviderInternalPort
{
  constructor(private readonly userRepo: UserRepositoryPort) {}

  async execute(input: UpgradeProfileToProviderInternalInput): Promise<void> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new Error(
        `[upgradeProfileToProvider] user not found: ${input.userId}`,
      );
    }
    user.upgradeToProvider();
    await this.userRepo.save(user);
    // TODO(ntizo): dispatch a ProfileUpgradedToProvider domain event via outbox.
  }
}
