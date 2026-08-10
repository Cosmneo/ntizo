import { describe, expect, it } from "bun:test";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { ProviderStatus } from "@ntizo/shared";
import { DecideProviderStatusCommand } from "../decide-provider-status.command";
import type { ProviderRepositoryPort } from "../../../ports/outbound";
import type { OutboxPort } from "../../../../../../shared/app/ports/outbox.port";
import { Provider } from "../../../../domain/aggregates";
import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

const ADMIN = "admin-1";
const OWNER = "owner-1";

class CapturingOutbox implements OutboxPort {
  published: BaseDomainEvent[] = [];
  async publish(events: BaseDomainEvent[]): Promise<void> {
    this.published.push(...events);
  }
}

/** Runs the work; restores nothing, because no test here exercises rollback. */
const unitOfWork: UnitOfWorkPort = {
  atomicExecute: async <T,>(work: () => Promise<T>): Promise<T> => work(),
} as UnitOfWorkPort;

function makeRepo(provider: Provider | null) {
  const saved: Provider[] = [];
  const repo = {
    async findById(id: string) {
      return provider && provider.id === id ? provider : null;
    },
    async save(p: Provider) {
      saved.push(p);
    },
  } as unknown as ProviderRepositoryPort;
  return { repo, saved };
}

function makeProvider(): Provider {
  return Provider.create({
    id: "prov-1",
    ownerUserId: OWNER,
    type: "individual",
    name: "Canalizações Namaacha",
    slug: "canalizacoes-namaacha",
  });
}

function ctxFor(userId: string): ExecutionContext {
  return {
    requester: {
      type: "authenticated",
      user: {
        userId,
        email: `${userId}@ntizo.test`,
        firstName: "",
        lastName: "",
        platformRole: "admin",
      },
    },
    metadata: {},
  } as unknown as ExecutionContext;
}

const ctx = ctxFor(ADMIN);

describe("DecideProviderStatusCommand", () => {
  it("starts a new provider as an application, not a live business", async () => {
    // The rule the whole queue rests on. Were this `Active`, registration
    // would put an unreviewed business in front of customers and the queue
    // would be permanently empty — a feature that looks like it works.
    expect(makeProvider().status).toBe(ProviderStatus.Pending);
  });

  it("approves an application and records who decided", async () => {
    const provider = makeProvider();
    const { repo, saved } = makeRepo(provider);
    const outbox = new CapturingOutbox();

    await new DecideProviderStatusCommand(repo, unitOfWork, outbox).execute(ctx, {
      providerId: "prov-1",
      status: ProviderStatus.Active,
    });

    expect(saved).toHaveLength(1);
    expect(provider.status).toBe(ProviderStatus.Active);

    // The admin's id, not the owner's. A log that cannot say who decided is a
    // log nobody can act on when the decision is questioned.
    const event = outbox.published.at(-1);
    expect(event?.eventName).toBe("provider.status.decided");
    expect(event?.payload).toMatchObject({
      from: ProviderStatus.Pending,
      to: ProviderStatus.Active,
      decidedByUserId: ADMIN,
    });
  });

  it("refuses a move the lifecycle does not allow, and saves nothing", async () => {
    // Suspending an application that never traded is not a decision anyone
    // means to make; rejecting it is. The refusal has to land before the
    // write, not after.
    const provider = makeProvider();
    const { repo, saved } = makeRepo(provider);
    const outbox = new CapturingOutbox();

    await expect(
      new DecideProviderStatusCommand(repo, unitOfWork, outbox).execute(ctx, {
        providerId: "prov-1",
        status: ProviderStatus.Suspended,
      }),
    ).rejects.toThrow();

    expect(saved).toHaveLength(0);
    expect(outbox.published).toHaveLength(0);
    expect(provider.status).toBe(ProviderStatus.Pending);
  });

  it("rejects an application without letting it be reached as suspended", async () => {
    const provider = makeProvider();
    const { repo } = makeRepo(provider);

    await new DecideProviderStatusCommand(repo, unitOfWork, new CapturingOutbox()).execute(
      ctx,
      { providerId: "prov-1", status: ProviderStatus.Rejected },
    );

    expect(provider.status).toBe(ProviderStatus.Rejected);
  });

  it("does not require the caller to own the provider", async () => {
    // The point of the command. An admin is not a member of the business they
    // decide on, and requiring membership would make the queue unusable by the
    // only people meant to use it.
    const provider = makeProvider();
    const { repo, saved } = makeRepo(provider);

    await new DecideProviderStatusCommand(repo, unitOfWork, new CapturingOutbox()).execute(
      ctxFor("someone-who-is-not-the-owner"),
      { providerId: "prov-1", status: ProviderStatus.Active },
    );

    expect(saved).toHaveLength(1);
  });

  it("refuses an unknown provider rather than creating one", async () => {
    const { repo, saved } = makeRepo(null);

    await expect(
      new DecideProviderStatusCommand(repo, unitOfWork, new CapturingOutbox()).execute(ctx, {
        providerId: "does-not-exist",
        status: ProviderStatus.Active,
      }),
    ).rejects.toThrow();

    expect(saved).toHaveLength(0);
  });
});
