import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { DeclineProviderInviteCommand } from "../decline-provider-invite.command";
import type {
  ProviderInviteRepositoryPort,
  ProviderRepositoryPort,
} from "../../../ports/outbound";
import type { OutboxPort } from "../../../../../../shared/app/ports/outbox.port";
import { Provider } from "../../../../domain/aggregates";
import { ProviderInvite } from "../../../../domain/entities/provider-invite";
import { InviteNotFoundError } from "../../../../domain/exceptions";
import type { ExecutionContext } from "../../../../../../shared/infrastructure/execution-context";

class RecordingOutbox implements OutboxPort {
  events: BaseDomainEvent[] = [];
  async publish(events: BaseDomainEvent[]): Promise<void> {
    this.events.push(...events);
  }
}

const unitOfWork = {
  atomicExecute: async <T,>(work: () => Promise<T>): Promise<T> => work(),
} as UnitOfWorkPort;

function makeInvite(overrides: { status?: "revoked" | "accepted" } = {}) {
  const provider = Provider.create({
    id: randomUUID(),
    ownerUserId: "owner-1",
    type: "organization",
    name: "Salão Beleza",
    slug: "salao-beleza-aaaaaa",
    commissionBps: 1000,
  });
  const invite = ProviderInvite.create({
    id: randomUUID(),
    providerId: provider.id,
    email: "nova@example.com",
    role: "staff",
    token: "tok-1",
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  if (overrides.status === "revoked") invite.markRevoked();
  if (overrides.status === "accepted") invite.markAccepted();
  return { provider, invite };
}

function makeCommand(
  provider: Provider,
  invite: ProviderInvite,
  opts: { markSucceeds?: boolean } = {},
) {
  const outbox = new RecordingOutbox();
  const calls = { markDeclined: 0 };

  const providerRepo = {
    async findById(id: string) {
      return id === provider.id ? provider : null;
    },
  } as unknown as ProviderRepositoryPort;

  const inviteRepo = {
    async findByToken(token: string) {
      return token === invite.token ? invite : null;
    },
    async markDeclinedIfPending() {
      calls.markDeclined += 1;
      // Default true; false models a concurrent revoke that committed first.
      return opts.markSucceeds ?? true;
    },
  } as unknown as ProviderInviteRepositoryPort;

  return {
    outbox,
    calls,
    command: new DeclineProviderInviteCommand(
      providerRepo,
      inviteRepo,
      unitOfWork,
      outbox,
    ),
  };
}

function ctx(): ExecutionContext {
  return {
    requester: {
      type: "authenticated",
      user: {
        userId: "invitee-1",
        email: "nova@example.com",
        firstName: "",
        lastName: "",
        platformRole: "customer",
      },
    },
    metadata: {},
  } as unknown as ExecutionContext;
}

describe("DeclineProviderInviteCommand", () => {
  it("declines a pending invitation", async () => {
    const { provider, invite } = makeInvite();
    const { command, outbox } = makeCommand(provider, invite);

    const result = await command.execute(ctx(), { token: "tok-1" });

    expect(result.declined).toBe(true);
    expect(invite.status).toBe("declined");
    expect(outbox.events.map((e) => e.eventName)).toContain(
      "provider.invite.declined",
    );
  });

  it("does not mark it revoked", async () => {
    // The distinction is the whole reason this is its own state: revoked is
    // the workspace withdrawing an offer, declined is the invitee refusing
    // one. An admin reading the list must be able to tell them apart.
    const { provider, invite } = makeInvite();
    const { command } = makeCommand(provider, invite);

    await command.execute(ctx(), { token: "tok-1" });

    expect(invite.status).not.toBe("revoked");
  });

  it("reports false, without an error, for an already-revoked invitation", async () => {
    // They were turning it down anyway. Telling them their refusal failed is a
    // worse answer than "it is not going to happen".
    const { provider, invite } = makeInvite({ status: "revoked" });
    const { command, calls, outbox } = makeCommand(provider, invite);

    const result = await command.execute(ctx(), { token: "tok-1" });

    expect(result.declined).toBe(false);
    expect(calls.markDeclined).toBe(0);
    expect(outbox.events).toHaveLength(0);
  });

  it("reports false for one already accepted", async () => {
    const { provider, invite } = makeInvite({ status: "accepted" });
    const { command } = makeCommand(provider, invite);

    expect((await command.execute(ctx(), { token: "tok-1" })).declined).toBe(false);
  });

  it("publishes nothing when a concurrent write won the race", async () => {
    // The invite is read before the transaction opens, so a revoke can commit
    // in between. The conditional update reports the no-op, and this must not
    // then announce a decline that did not happen.
    const { provider, invite } = makeInvite();
    const { command, outbox } = makeCommand(provider, invite, {
      markSucceeds: false,
    });

    const result = await command.execute(ctx(), { token: "tok-1" });

    expect(result.declined).toBe(false);
    expect(outbox.events).toHaveLength(0);
  });

  it("refuses an unknown token", async () => {
    const { provider, invite } = makeInvite();
    const { command } = makeCommand(provider, invite);

    await expect(
      command.execute(ctx(), { token: "not-a-token" }),
    ).rejects.toBeInstanceOf(InviteNotFoundError);
  });
});
