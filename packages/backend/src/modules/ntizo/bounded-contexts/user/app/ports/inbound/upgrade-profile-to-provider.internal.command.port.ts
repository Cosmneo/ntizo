// Internal command port — invoked by orchestration workflows on behalf of
// an already-authorized requester. No ExecutionContext: the caller upstream
// has already performed authorization.

export interface UpgradeProfileToProviderInternalInput {
  userId: string;
}

export interface UpgradeProfileToProviderInternalPort {
  execute(input: UpgradeProfileToProviderInternalInput): Promise<void>;
}
