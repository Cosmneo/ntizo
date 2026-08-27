import { DrizzleThreadRepository } from "../infrastructure/repositories/drizzle/thread.repository";
import { DrizzleMessageRepository } from "../infrastructure/repositories/drizzle/message.repository";
import { DrizzleProviderReader } from "../infrastructure/outbound-adapters/cross-bc/provider-reader.adapter";
import { StartThreadCommand } from "../app/use-cases/start-thread.command";
import { SendMessageCommand } from "../app/use-cases/send-message.command";
import { MarkThreadReadCommand } from "../app/use-cases/mark-thread-read.command";
import { DrizzleUnitOfWork } from "../../../../../shared/infrastructure/unit-of-work";

export function bootstrapCommunication() {
  const threadRepository = new DrizzleThreadRepository();
  const messageRepository = new DrizzleMessageRepository();
  const providerReader = new DrizzleProviderReader();
  const unitOfWork = new DrizzleUnitOfWork();

  return {
    adapters: { threadRepository, messageRepository, providerReader, unitOfWork },
    useCases: {
      startThread: new StartThreadCommand(threadRepository, providerReader),
      sendMessage: new SendMessageCommand(threadRepository, messageRepository, unitOfWork),
      markThreadRead: new MarkThreadReadCommand(threadRepository, messageRepository),
    },
  };
}

export type CommunicationBootstrap = ReturnType<typeof bootstrapCommunication>;
