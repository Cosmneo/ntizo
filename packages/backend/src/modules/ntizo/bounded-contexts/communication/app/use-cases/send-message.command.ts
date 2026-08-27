import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { Message } from "../../domain/aggregates/message.aggregate";
import { ThreadNotVisibleError } from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { MessageRepositoryPort } from "../ports/outbound/message.repository.port";

export interface SendMessageInput {
  threadId: string;
  senderUserId: string;
  body: string;
}

/**
 * Sending into an existing conversation — the customer on it, or any member
 * of its provider.
 *
 * Visibility is resolved once, by `findVisible`, and its answer IS the
 * authorization decision: the same predicate the customer's and the
 * provider's inbox both rely on to decide who may even open a thread, so a
 * caller who cannot see it cannot write into it either. `ThreadNotVisibleError`
 * is deliberately the same refusal `findVisible` returns for a thread that
 * plainly does not exist — see that port's doc comment for why the two must
 * stay indistinguishable to the caller: telling "not yours" apart from
 * "doesn't exist" tells an attacker probing thread ids which ones are real.
 *
 * The insert and the touch happen inside one transaction, insert first: a
 * message that exists but never moved its thread's `last_message_at` would
 * silently drop out of both inboxes' newest-first ordering, and
 * `atomicExecute` is what makes "both writes or neither" true across a
 * failure landing between the two statements.
 */
export class SendMessageCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: SendMessageInput): Promise<{ id: string }> {
    const visible = await this.threads.findVisible(input.threadId, input.senderUserId);
    if (!visible) throw new ThreadNotVisibleError();

    const message = Message.compose({
      threadId: input.threadId,
      senderUserId: input.senderUserId,
      body: input.body,
      now: this.now(),
    });

    return await this.unitOfWork.atomicExecute(async () => {
      const id = await this.messages.insert(message);
      await this.threads.touch(input.threadId, message.createdAt);
      return { id };
    });
  }
}
