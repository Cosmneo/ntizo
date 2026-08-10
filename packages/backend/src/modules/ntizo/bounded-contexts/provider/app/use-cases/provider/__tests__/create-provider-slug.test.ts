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
import { slugCandidates } from "../../../../domain/services/provider-slug";
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

function run(taken: string[], name = "Salão Beleza") {
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
        name,
        // A hint the client sends. The command is expected to ignore it.
        slug: "salao-beleza",
      }),
  };
}

describe("slugCandidates", () => {
  const ID = "0192f3a4-5b6c-7d8e-9f01-234567890abc";

  it("always carries a suffix, even with nothing to collide with", () => {
    // The property the whole change is for. A bare `salao-beleza` would mean
    // the first business to register wins the name and everyone else is
    // numbered after it — a ranking nobody earned, decided by a race.
    const [first] = slugCandidates("Salão Beleza", ID);
    expect(first).toMatch(/^salao-beleza-[0-9a-hjkmnp-tv-z]{6}$/);
  });

  it("is a pure function of name and id", () => {
    const a = [...slugCandidates("Salão Beleza", ID)];
    const b = [...slugCandidates("Salão Beleza", ID)];
    expect(a).toEqual(b);
  });

  it("gives two businesses of the same name different slugs", () => {
    const [a] = slugCandidates("Salão Beleza", ID);
    const [b] = slugCandidates("Salão Beleza", "0192f3a4-5b6c-7d8e-9f01-234567890abd");
    expect(a).not.toBe(b);
  });

  it("folds accents through decomposition rather than dropping them", () => {
    // Stripping non-ASCII without NFKD gives `salo`; a naive replace gives
    // `sal-o`. Neither is the word.
    const [slug] = slugCandidates("Salão", ID);
    expect(slug!.startsWith("salao-")).toBe(true);
  });

  it("still produces a usable slug when the name leaves no ASCII stem", () => {
    // A name written entirely in another script reduces to nothing. The
    // suffix alone is a working URL; refusing to create the business is not.
    const [slug] = slugCandidates("東京サービス", ID);
    expect(slug).toMatch(/^[0-9a-hjkmnp-tv-z]{6}$/);
  });

  it("lengthens the suffix rather than repeating one", () => {
    const candidates = [...slugCandidates("Salão Beleza", ID)];
    const suffixes = candidates.map((c) => c.replace("salao-beleza-", ""));
    expect(new Set(suffixes).size).toBe(candidates.length);
    expect(suffixes.map((s) => s.length)).toEqual([6, 7, 8, 9, 10, 11, 12]);
  });

  it("omits the letters that misread when typed back", () => {
    // Crockford drops i, l, o and u so a slug read off a screen cannot become
    // a different one — and cannot accidentally spell a word.
    for (const slug of slugCandidates("Salão Beleza", ID)) {
      expect(slug.replace("salao-beleza-", "")).not.toMatch(/[ilou]/);
    }
  });
});

describe("CreateProviderCommand — slugs", () => {
  it("saves the first free candidate", async () => {
    const { execute, saved } = run([]);
    await execute();
    expect(saved[0]!.slug).toMatch(/^salao-beleza-[0-9a-hjkmnp-tv-z]{6}$/);
  });

  it("ignores the slug the client asked for", async () => {
    // The client sends a slugified name as a hint. Honouring it would let two
    // clients race for one URL, and let a caller claim someone else's.
    const { execute, saved } = run([]);
    await execute();
    expect(saved[0]!.slug).not.toBe("salao-beleza");
  });

  it("lengthens the suffix when the short one is taken", async () => {
    // The id is minted inside the command, so the candidates cannot be
    // precomputed here. Refusing the first N answers is equivalent and does
    // not depend on knowing them.
    const seen: string[] = [];
    const providerRepo = {
      async findBySlug(slug: string) {
        seen.push(slug);
        return seen.length <= 2 ? ({} as Provider) : null;
      },
      async save(p: Provider) {
        saved.push(p);
      },
    } as unknown as ProviderRepositoryPort;

    const saved: Provider[] = [];
    const command = new CreateProviderCommand(
      providerRepo,
      { async save() {} } as unknown as ProviderMemberRepositoryPort,
      unitOfWork,
      new SilentOutbox(),
    );
    await command.execute(ctx(), {
      type: "individual",
      name: "Salão Beleza",
      slug: "salao-beleza",
    });

    expect(seen).toHaveLength(3);
    expect(seen.map((slug) => slug.replace("salao-beleza-", "").length)).toEqual([
      6, 7, 8,
    ]);
    expect(saved[0]!.slug).toBe(seen[2]!);
  });

  it("two businesses with the same name both get created", async () => {
    // Before this, the second hit `provider_slug_unique` and the wizard showed
    // "an unexpected error occurred" to someone who has never seen a slug.
    const first = run([]);
    await first.execute();
    const second = run([first.saved[0]!.slug]);
    await second.execute();

    expect(second.saved).toHaveLength(1);
    expect(second.saved[0]!.slug).not.toBe(first.saved[0]!.slug);
  });

  it("refuses rather than inventing a thirteenth character", async () => {
    // Seven collisions running on one id is not a namespace problem — it is a
    // bug somewhere else, and minting a longer slug would hide it.
    const command = new CreateProviderCommand(
      { async findBySlug() { return {} as Provider; } } as unknown as ProviderRepositoryPort,
      { async save() {} } as unknown as ProviderMemberRepositoryPort,
      unitOfWork,
      new SilentOutbox(),
    );
    await expect(
      command.execute(ctx(), { type: "individual", name: "Salão Beleza", slug: "x" }),
    ).rejects.toThrow("PROVIDER_SLUG_EXHAUSTED");
  });
});
