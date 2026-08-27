import { ProviderNotContactableError } from "../../domain/exceptions";
import type { ThreadOpenResult, ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { ProviderReaderPort } from "../ports/outbound/provider-reader.port";

export interface StartThreadInput {
  customerUserId: string;
  providerId: string;
}

/**
 * Opening a conversation with a provider — or finding the one that already
 * exists for this (customer, provider) pair.
 *
 * Idempotent by construction, not by anything this command does itself:
 * `openOrFind` is an upsert against `thread_customer_provider_uq`, so
 * calling this twice for the same pair returns the same thread rather than
 * opening a second one, and two customers doing it at the same instant
 * cannot race into two rows either — see that port's doc comment.
 *
 * This command adds exactly one thing on top of the upsert: a provider
 * nobody can find in the public directory (`provider.status !== 'active'`)
 * is a provider nobody should be able to open a conversation with. Checked
 * before the write, not left for the customer to discover only after
 * sending a first message nobody on the other side will ever see.
 */
export class StartThreadCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly providers: ProviderReaderPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: StartThreadInput): Promise<ThreadOpenResult> {
    if (!(await this.providers.isContactable(input.providerId))) {
      throw new ProviderNotContactableError();
    }
    return await this.threads.openOrFind(input.customerUserId, input.providerId, this.now());
  }
}
