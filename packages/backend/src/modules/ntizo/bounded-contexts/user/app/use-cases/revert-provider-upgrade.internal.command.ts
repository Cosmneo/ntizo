import type { UserRepositoryPort } from "../ports/outbound";
import type {
  RevertProviderUpgradeInternalPort,
  RevertProviderUpgradeInternalInput,
} from "../ports/inbound/revert-provider-upgrade.internal.command.port";

/**
 * INTERNAL compensation command — resets verificationStatus back to null
 * when a downstream saga step fails after the profile was already upgraded.
 */
export class RevertProviderUpgradeInternalCommand
  implements RevertProviderUpgradeInternalPort
{
  constructor(private readonly userRepo: UserRepositoryPort) {}

  async execute(input: RevertProviderUpgradeInternalInput): Promise<void> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      // Nothing to revert — treat as idempotent.
      return;
    }
    user.revertProviderUpgrade();
    await this.userRepo.save(user);
    // TODO(ntizo): emit a compensation event via outbox.
  }
}
