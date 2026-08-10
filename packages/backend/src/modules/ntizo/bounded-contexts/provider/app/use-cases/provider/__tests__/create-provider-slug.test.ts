import { describe, expect, it } from "bun:test";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { CreateProviderCommand } from "../create-provider.command";
import type {
  ProviderMemberRepositoryPort,
  ProviderRepositoryPort,
} from "../../../ports/outbound";
import type { OutboxPort } from "../../../../../../shared/app/ports/outbox.port";
import { Provider } from "../../../../domain/aggregates";
import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

class SilentOutbox implements OutboxPort {
  async publish(_events: BaseDomainEvent[]): Promise<void> {}
}

const unitOfWork = {
  atomicExecute: async <T,>(work: () => Promise<T>): Promise<T> => work(),
} as UnitOfWorkPort;

/** Remembers what was saved, and reports a slug as taken once it is. */
function makeRepos(taken: string[]) {
  const saved: Provider[] = [];
  const slugs = new Set(taken);

  const providerRepo = {
    async findBySlug(slug: string) {
      return slugs.has(slug) ? ({} as Provider) : null;
    },
    async save(provider: Provider) {
      saved.push(provider);
      slugs.add(provider.slug);
    },
  } as unknown as ProviderRepositoryPort;

  const memberRepo = { async save() {} } as unknown as ProviderMemberRepositoryPort;
  return { providerRepo, memberRepo, saved };
}

function ctx(): ExecutionContext {
  return {
    requester: {
      type: "authenticated",
      user: {
        userId: "owner-1",
        email: "owner@ntizo.test",
        firstName: "",
        lastName: "",
        platformRole: "customer",
      },
    },
    metadata: {},
  } as unknown as ExecutionContext;
}

function run(taken: string[], slug = "salao-beleza") {
  const repos = makeRepos(taken);
  const command = new CreateProviderCommand(
    repos.providerRepo,
    repos.memberRepo,
    unitOfWork,
    new SilentOutbox(),
  );
  return {
    ...repos,
    execute: () =>
      command.execute(ctx(), {
        type: "individual",
        name: "Salão Beleza",
        slug,
      }),
  };
}

describe("CreateProviderCommand — slug collisions", () => {
  it("uses the requested slug when it is free", async () => {
    const { execute, saved } = run([]);
    await execute();
    expect(saved[0]?.slug).toBe("salao-beleza");
  });

  it("finds a free variation rather than failing", async () => {
    // Two businesses may legitimately share a name — one in Maputo, one in
    // Beira. Before this the second hit the unique index and the wizard showed
    // "an unexpected error occurred" to someone who has never seen a slug.
    const { execute, saved } = run(["salao-beleza"]);
    await execute();
    expect(saved[0]?.slug).toBe("salao-beleza-2");
  });

  it("keeps counting past the first collision", async () => {
    const { execute, saved } = run(["salao-beleza", "salao-beleza-2", "salao-beleza-3"]);
    await execute();
    expect(saved[0]?.slug).toBe("salao-beleza-4");
  });

  it("still creates the business when every tidy option is taken", async () => {
    // Refusing to create a business because fifty others share its name would
    // be the schema deciding who may trade.
    const taken = ["salao-beleza", ...Array.from({ length: 60 }, (_, i) => `salao-beleza-${i + 2}`)];
    const { execute, saved } = run(taken);
    await execute();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.slug).toMatch(/^salao-beleza-\d+$/);
    expect(taken).not.toContain(saved[0]!.slug);
  });
});
