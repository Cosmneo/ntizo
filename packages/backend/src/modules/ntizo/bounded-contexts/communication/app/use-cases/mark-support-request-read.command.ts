import { SupportRequestNotFoundError } from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { MessageRepositoryPort } from "../ports/outbound/message.repository.port";

/** The platform side reading a request: everything the requester side sent becomes read. */
export class MarkSupportRequestReadCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: { threadId: string }): Promise<{ marked: number }> {
    const thread = await this.threads.findSupportThread(input.threadId);
    if (!thread) throw new SupportRequestNotFoundError();
    const marked = await this.messages.markReadForPlatform(input.threadId, this.now());
    return { marked };
  }
}
