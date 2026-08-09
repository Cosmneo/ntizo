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
    // Left unwired by Task 6 (outbox port/adapter + dispatch-site replacement):
    // no ProfileUpgradedToProvider event class exists, and the User aggregate
    // has no event-recording machinery at all (no `_events`/`recordEvent`/
    // `pullEvents` — confirmed absent in Task 4's scope check, which touched
    // only the Provider BC's 9 event classes). Adding a new domain event and
    // wiring event-recording into User is domain modeling, out of scope for
    // a port/adapter task; there is nothing here yet to pull and publish.
  }
}
