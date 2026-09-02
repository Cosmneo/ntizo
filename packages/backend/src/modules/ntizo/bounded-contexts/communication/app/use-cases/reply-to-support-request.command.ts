import type { UnitOfWorkPort } from "@cosmneo/onion-lasagna/ports";
import { Message } from "../../domain/aggregates/message.aggregate";
import { SupportRequestNotFoundError } from "../../domain/exceptions";
import type { ThreadRepositoryPort } from "../ports/outbound/thread.repository.port";
import type { MessageRepositoryPort } from "../ports/outbound/message.repository.port";
import type { AttachmentRepositoryPort } from "../ports/outbound/attachment.repository.port";
import type { AttachmentStoragePort } from "../ports/outbound/attachment-storage.port";
import { resolveAttachments, type AttachmentDescriptor } from "./resolve-attachments";

export interface ReplyToSupportRequestInput {
  threadId: string;
  adminUserId: string;
  body: string;
  attachments?: AttachmentDescriptor[] | undefined;
}

/**
 * The platform answering. No `visibleToViewer`: the handler proved the role,
 * and `findSupportThread` scopes the read to support threads so an admin
 * cannot write into a private conversation by id. No contact check — the
 * platform may give out its own number. Same insert / attachments / touch
 * transaction as `SendMessageCommand`.
 */
export class ReplyToSupportRequestCommand {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly messages: MessageRepositoryPort,
    private readonly attachments: AttachmentRepositoryPort,
    private readonly attachmentStorage: AttachmentStoragePort,
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ReplyToSupportRequestInput): Promise<{ id: string }> {
    const thread = await this.threads.findSupportThread(input.threadId);
    if (!thread) throw new SupportRequestNotFoundError();

    const attachments = await resolveAttachments(this.attachmentStorage, input.adminUserId, input.attachments ?? []);
    const message = Message.compose({
      threadId: input.threadId,
      senderUserId: input.adminUserId,
      senderSide: "platform",
      body: input.body,
      attachmentCount: attachments.length,
      now: this.now(),
    });

    return await this.unitOfWork.atomicExecute(async () => {
      const id = await this.messages.insert(message);
      if (attachments.length > 0) await this.attachments.insertMany(id, attachments);
      await this.threads.touch(input.threadId, message.createdAt);
      return { id };
    });
  }
}
