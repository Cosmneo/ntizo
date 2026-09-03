import { ThreadNotVisibleError } from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { MessageRepositoryPort } from "../ports/outbound/message.repository.port";

export interface MarkThreadReadInput {
  threadId: string;
  viewerUserId: string;
}

/**
 * Marking everything the other side sent in this thread as read.
 *
 * `findVisible` is checked first, the same gate `SendMessageCommand` uses —
 * and it is load-bearing here, not a formality `markReadForViewer` would
 * make redundant. That statement's own "other side" predicate is now
 * `sender_side <> viewerSide(viewer)`, and `viewerSide` places anyone who is
 * not the thread's customer on `provider` — including a stranger. A
 * stranger who is neither the customer nor a member of the provider but
 * merely guesses a real `threadId` would otherwise still succeed at marking
 * every provider-side message in that thread read. `findVisible` is what
 * actually excludes them, before that statement ever runs.
 *
 * Returns how many messages were actually marked rather than a bare "ok" —
 * a caller polling for unread state can use it directly instead of asking
 * again.
 */
export class MarkThreadReadCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: MarkThreadReadInput): Promise<{ marked: number }> {
    const visible = await this.threads.findVisible(input.threadId, input.viewerUserId);
    if (!visible) throw new ThreadNotVisibleError();

    const marked = await this.messages.markReadForViewer(input.threadId, input.viewerUserId, this.now());
    return { marked };
  }
}
