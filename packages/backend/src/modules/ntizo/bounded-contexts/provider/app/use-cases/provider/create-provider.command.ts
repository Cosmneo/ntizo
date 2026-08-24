import { randomUUID } from "node:crypto";
import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import {
  type ExecutionContext,
  requireAuthenticated,
} from "../../../../../shared/infrastructure/execution-context";
import type {
  CreateProviderInput,
  CreateProviderOutput,
  CreateProviderPort,
} from "../../ports/inbound/provider";
import type {
  ProviderMemberRepositoryPort,
  PlatformSettingsPort,
  ProviderRepositoryPort,
  WalletRepositoryPort,
} from "../../ports/outbound";
import type { OutboxPort } from "../../../../../shared/app/ports/outbox.port";
import { Provider } from "../../../domain/aggregates/provider";
import { slugCandidates } from "../../../domain/services/provider-slug";
import { Address } from "../../../domain/value-objects/address.vo";
import { ProviderMember } from "../../../domain/entities/provider-member";
import { ProviderMemberAdded } from "../../../domain/events";

const DEFAULT_WALLET_CURRENCY = "MZN";

export class CreateProviderCommand implements CreateProviderPort {
  constructor(
    private readonly providerRepo: ProviderRepositoryPort,
    private readonly memberRepo: ProviderMemberRepositoryPort,
    private readonly walletRepo: WalletRepositoryPort,
    private readonly platformSettings: PlatformSettingsPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly outboxPort: OutboxPort,
  ) {}

  async execute(
    ctx: ExecutionContext,
    input: CreateProviderInput,
  ): Promise<CreateProviderOutput> {
    const requester = requireAuthenticated(ctx);

    // Computed first: the slug is derived from it, which is what makes slug
    // generation a pure function of (name, id) rather than a probe loop.
    const providerId = randomUUID();

    // Read once, stamped on, and never consulted again for this provider —
    // that is the whole point of copying it. Moving the platform default later
    // must not change a rate a business already agreed to.
    const commissionBps = await this.platformSettings.defaultCommissionBps();

    const provider = Provider.create({
      id: providerId,
      commissionBps,
      ownerUserId: requester.userId,
      type: input.type,
      name: input.name,
      slug: await this.freeSlug(input.name, providerId),
      description: input.description,
      address: input.address ? Address.create(input.address) : undefined,
    });

    await this.unitOfWork.atomicExecute(async () => {
      await this.providerRepo.save(provider);

      // Owner is always recorded as the first member, regardless of provider type.
      const ownerMember = ProviderMember.create({
        id: randomUUID(),
        providerId: provider.id,
        userId: requester.userId,
        role: "owner",
      });
      await this.memberRepo.save(ownerMember);

      // In the same transaction as the provider, so a workspace never exists
      // without somewhere for its money to land. Doing it lazily at the first
      // payment would mean the branch "no wallet yet" has to be written into
      // every payment path, and forgotten in one of them.
      await this.walletRepo.createForProvider({
        providerId: provider.id,
        // One currency per wallet. Mozambique at launch; a provider trading in
        // another gets another wallet rather than a wallet with two balances.
        currency: DEFAULT_WALLET_CURRENCY,
      });

      // Mirrors accept-provider-invite.command.ts: every member row must
      // have a matching event, so a future projection rebuilding
      // membership from the event stream sees the owner too — the one
      // member every provider is guaranteed to have.
      provider.recordEvent(
        new ProviderMemberAdded({
          providerId: provider.id,
          userId: requester.userId,
          role: "owner",
        }),
      );

      await this.outboxPort.publish(provider.pullEvents(), "provider");
    });

    return { providerId: provider.id };
  }

  /**
   * The requested slug, or the first free variation of it.
   *
   * Two businesses may legitimately share a name — a Salão Beleza in Maputo and
   * another in Beira — and the slug is derived from that name rather than
   * chosen. Before this, the second one hit the unique index and the onboarding
   * wizard showed "an unexpected error occurred" to somebody who has never seen
   * a slug and could not act on it. Making them rename their business because a
   * URL collided is charging them for our schema.
   *
   * Here rather than in the caller: only this side knows what is taken, and a
   * check made in the browser is stale by the time it arrives. This narrows the
   * race without closing it — two simultaneous creations of the same name can
   * still collide, and the unique index remains the thing that guarantees
   * correctness. What changes is that the common case stops failing.
   */
  /**
   * The first candidate nobody holds.
   *
   * `input.slug` is ignored on purpose. The client sends a slugified name as a
   * hint, and honouring it would let two clients race for the same URL and let
   * a caller choose someone else's. The name is the input; the URL is ours.
   */
  private async freeSlug(name: string, providerId: string): Promise<string> {
    for (const candidate of slugCandidates(name, providerId)) {
      if (!(await this.providerRepo.findBySlug(candidate))) return candidate;
    }
    // Twelve base32 characters over one id have collided seven times running.
    // That is not a namespace problem, it is a bug somewhere else — and
    // silently minting a thirteenth would hide it.
    throw new Error("PROVIDER_SLUG_EXHAUSTED");
  }

}
