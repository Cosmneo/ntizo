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

/**
 * How long a just-created workspace absorbs an identical request instead of
 * becoming a second one.
 *
 * Three accounts reached production holding two or three byte-identical
 * workspaces, created 1.8, 3.3 and 3.9 seconds apart — a wizard submitted
 * twice, with nothing on this side to notice. A minute is far wider than any
 * of those gaps and far narrower than the gap between two deliberate acts:
 * nobody registers the same business name twice in the same minute on
 * purpose.
 *
 * A window rather than a permanent rule, because the permanent rule would be
 * wrong. An owner may genuinely run two workspaces under one name — the same
 * possibility `freeSlug` below exists to accommodate — and refusing them
 * forever to catch a double-click charges the honest case for the accident.
 */
const DUPLICATE_SUBMIT_WINDOW_MS = 60_000;

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

    // Before anything is minted. A repeated submit returns the workspace the
    // first one made, so the caller cannot tell the difference — which is the
    // point: the browser that sent twice wanted one workspace, and an error
    // here would show a failure for something that worked.
    const alreadyMade = await this.recentIdenticalWorkspace(requester.userId, input);
    if (alreadyMade) return { providerId: alreadyMade };

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
   * The id of a workspace this same person just created under this same name,
   * if there is one.
   *
   * Keyed on owner + name + type, not on "owns anything already": two
   * different businesses under one account are legitimate, and so is the same
   * name under two different accounts — a Salão Beleza in Maputo and another
   * in Beira. The only thing being caught is one person's browser sending the
   * same form twice.
   *
   * Case- and whitespace-insensitive on the name, because a retry may carry
   * the field re-trimmed or re-cased by the client and still be the same
   * submission.
   *
   * This narrows the race without closing it — two truly simultaneous
   * requests can both read before either writes. Closing it needs a unique
   * index, and there is no correct one to add: the pair is only a duplicate
   * within a time window, which an index cannot express. What changes is that
   * the observed failure — submits seconds apart, not microseconds — stops
   * happening.
   */
  private async recentIdenticalWorkspace(
    ownerUserId: string,
    input: CreateProviderInput,
  ): Promise<string | null> {
    const wanted = input.name.trim().toLocaleLowerCase();
    const cutoff = Date.now() - DUPLICATE_SUBMIT_WINDOW_MS;
    const mine = await this.providerRepo.findByOwnerUserId(ownerUserId);
    const match = mine.find(
      (p) =>
        p.type === input.type &&
        p.name.trim().toLocaleLowerCase() === wanted &&
        p.createdAt.getTime() >= cutoff,
    );
    return match?.id ?? null;
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
