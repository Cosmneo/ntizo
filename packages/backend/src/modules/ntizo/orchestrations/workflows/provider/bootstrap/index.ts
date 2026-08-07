// Provider orchestration bootstrap.
//
// Takes internal ports from the user and provider BCs and returns the
// wired-up cross-BC workflows.

import type {
  UpgradeProfileToProviderInternalPort,
  RevertProviderUpgradeInternalPort,
} from "../../../../bounded-contexts/user/app/ports/inbound";
import type {
  CreateProviderInternalPort,
  DeactivateProviderInternalPort,
} from "../../../../bounded-contexts/provider/app/ports/inbound/provider";
import { RegisterUserAsProviderWorkflow } from "../app/use-cases/register-user-as-provider.workflow";

export interface ProviderWorkflowsDeps {
  userInternal: {
    upgradeProfileToProvider: UpgradeProfileToProviderInternalPort;
    revertProviderUpgrade: RevertProviderUpgradeInternalPort;
  };
  providerInternal: {
    createProvider: CreateProviderInternalPort;
    deactivateProvider: DeactivateProviderInternalPort;
  };
}

export function bootstrapProviderWorkflows(deps: ProviderWorkflowsDeps) {
  const registerUserAsProvider = new RegisterUserAsProviderWorkflow(
    deps.userInternal.upgradeProfileToProvider,
    deps.userInternal.revertProviderUpgrade,
    deps.providerInternal.createProvider,
    deps.providerInternal.deactivateProvider,
  );

  return {
    useCases: {
      registerUserAsProvider,
    },
  };
}

export type ProviderWorkflowsBootstrap = ReturnType<
  typeof bootstrapProviderWorkflows
>;
