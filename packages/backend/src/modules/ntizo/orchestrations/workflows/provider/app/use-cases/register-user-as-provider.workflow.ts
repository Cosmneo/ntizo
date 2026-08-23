// Register-User-As-Provider Saga Workflow
//
// Orchestrates the cross-BC flow that turns an authenticated user into a
// provider:
//   Step A (user BC):     upgradeProfileToProvider
//   Step B (provider BC): createProvider (organization, owned by the user)
//
// If step B fails, step A is compensated (verificationStatus reset to null).
// If anything below step B fails in the future, step B is compensated
// (provider deactivated).

import { runSaga, type SagaStep } from "../../../../../shared/infrastructure/saga/saga";
import type {
  ExecutionContext,
} from "../../../../../shared/infrastructure/execution-context";
import type { AuthenticatedRequester } from "../../../../../shared/infrastructure/execution-context";
import type {
  UpgradeProfileToProviderInternalPort,
  RevertProviderUpgradeInternalPort,
} from "../../../../../bounded-contexts/user/app/ports/inbound";
import type {
  CreateProviderInternalPort,
  DeactivateProviderInternalPort,
} from "../../../../../bounded-contexts/provider/app/ports/inbound/provider";
import type {
  RegisterUserAsProviderWorkflowPort,
  RegisterUserAsProviderWorkflowInput,
  RegisterUserAsProviderWorkflowOutput,
} from "../ports/inbound/register-user-as-provider.workflow.port";

interface RegisterProviderSagaContext {
  userUpgraded: boolean;
  providerId?: string;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "provider";
}

function assertAuthenticated(
  ctx: ExecutionContext,
): AuthenticatedRequester {
  if (ctx.requester.type !== "authenticated") {
    throw new Error("[register-user-as-provider] unauthenticated");
  }
  return ctx.requester;
}

export class RegisterUserAsProviderWorkflow
  implements RegisterUserAsProviderWorkflowPort
{
  constructor(
    private readonly upgradeProfileToProvider: UpgradeProfileToProviderInternalPort,
    private readonly revertProviderUpgrade: RevertProviderUpgradeInternalPort,
    private readonly createProvider: CreateProviderInternalPort,
    private readonly deactivateProvider: DeactivateProviderInternalPort,
  ) {}

  async execute(
    input: RegisterUserAsProviderWorkflowInput,
  ): Promise<RegisterUserAsProviderWorkflowOutput> {
    const requester = assertAuthenticated(input.executionContext);
    const { user } = requester;

    // Resolve default name / slug.
    const localPart = user.email.split("@")[0] ?? "user";
    const displayBase = user.firstName?.trim() || localPart;
    const resolvedName =
      input.input.name?.trim() || `${capitalize(displayBase)}'s Org`;
    const resolvedSlug =
      input.input.slug?.trim().toLowerCase() || slugify(resolvedName);

    const ctx: RegisterProviderSagaContext = { userUpgraded: false };

    const steps: SagaStep<RegisterProviderSagaContext>[] = [
      {
        name: "upgradeUserProfile",
        run: async (c) => {
          await this.upgradeProfileToProvider.execute({ userId: user.userId });
          c.userUpgraded = true;
        },
        compensate: async (c) => {
          if (c.userUpgraded) {
            await this.revertProviderUpgrade.execute({ userId: user.userId });
          }
        },
      },
      {
        name: "createProvider",
        run: async (c) => {
          const { providerId } = await this.createProvider.execute({
            ownerUserId: user.userId,
            type: "organization",
            name: resolvedName,
            slug: resolvedSlug,
          });
          c.providerId = providerId;
        },
        compensate: async (c) => {
          if (c.providerId) {
            await this.deactivateProvider.execute({ providerId: c.providerId });
          }
        },
      },
    ];

    await runSaga(ctx, steps);

    // No dedicated saga-completion event needed here: the `createProvider`
    // step above already publishes `provider.created` in the same
    // transaction (`Provider.create` records it, `CreateProviderInternalCommand`
    // publishes it via the outbox), and the Notification context already
    // reacts to it — see
    // `write/notification/events/handlers/provider.event-handlers.ts`,
    // `provider.created` -> `ProviderWorkspaceWelcome`. This TODO used to ask
    // for a new event so notifications could react; that need is met. A
    // future consumer (analytics, say) that needs to react specifically to
    // "a user completed the become-a-provider journey" — as opposed to "a
    // provider row was created", which can happen other ways — is the only
    // remaining reason to add one.

    return { providerId: ctx.providerId! };
  }
}
