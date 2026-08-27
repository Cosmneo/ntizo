import { DrizzleThreadRepository } from "../../../bounded-contexts/communication/infrastructure/repositories/drizzle/thread.repository";
import { DrizzleMessageRepository } from "../../../bounded-contexts/communication/infrastructure/repositories/drizzle/message.repository";
import { DrizzleProviderReader } from "../../../bounded-contexts/communication/infrastructure/outbound-adapters/cross-bc/provider-reader.adapter";
import { DrizzleProviderNameReader } from "../infra/repositories/drizzle/provider-name-reader.adapter";
import { DrizzleThreadPreviewReader } from "../infra/repositories/drizzle/thread-preview-reader.adapter";
import {
  ListMyThreadsProjection,
  ListProviderThreadsProjection,
  ListThreadMessagesProjection,
} from "../app/use-cases/conversations.projection";

/**
 * The read tier imports the write tier's repositories rather than owning
 * duplicates — the same ruling `read/activity`'s and `read/notification`'s
 * bootstraps document, and for the same reason: this read model is the same
 * rows in the same shape as the write side's, and a second class running
 * identical SQL is two places to fix one bug. The two enrichment reads
 * (provider names, last-message previews) are new questions the write side
 * never had to answer, so those get the read tier's own port and adapter
 * instead — see their doc comments.
 */
export function bootstrapCommunicationRead() {
  const threadRepository = new DrizzleThreadRepository();
  const messageRepository = new DrizzleMessageRepository();
  const providerReader = new DrizzleProviderReader();
  const providerNameReader = new DrizzleProviderNameReader();
  const threadPreviewReader = new DrizzleThreadPreviewReader();

  return {
    adapters: {
      threadRepository,
      messageRepository,
      providerReader,
      providerNameReader,
      threadPreviewReader,
    },
    useCases: {
      listMyThreads: new ListMyThreadsProjection(
        threadRepository,
        messageRepository,
        providerNameReader,
        threadPreviewReader,
      ),
      listProviderThreads: new ListProviderThreadsProjection(
        threadRepository,
        messageRepository,
        providerReader,
        providerNameReader,
        threadPreviewReader,
      ),
      listThreadMessages: new ListThreadMessagesProjection(threadRepository, messageRepository),
    },
  };
}

export type CommunicationReadBootstrap = ReturnType<typeof bootstrapCommunicationRead>;
