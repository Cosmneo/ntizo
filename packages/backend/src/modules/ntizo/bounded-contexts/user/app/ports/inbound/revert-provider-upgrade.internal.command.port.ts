// Internal compensation command port — invoked by orchestration workflows
// when a downstream step fails after the profile was already upgraded.

export interface RevertProviderUpgradeInternalInput {
  userId: string;
}

export interface RevertProviderUpgradeInternalPort {
  execute(input: RevertProviderUpgradeInternalInput): Promise<void>;
}
