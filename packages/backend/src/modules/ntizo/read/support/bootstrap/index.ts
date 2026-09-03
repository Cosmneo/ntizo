import { DrizzleThreadRepository } from "../../../bounded-contexts/communication/infrastructure/repositories/drizzle/thread.repository";
import { DrizzleMessageRepository } from "../../../bounded-contexts/communication/infrastructure/repositories/drizzle/message.repository";
import { DrizzleAttachmentRepository } from "../../../bounded-contexts/communication/infrastructure/repositories/drizzle/attachment.repository";
import { DrizzleSupportRequestRepository } from "../../../bounded-contexts/communication/infrastructure/repositories/drizzle/support-request.repository";
import { DrizzleProviderNameReader } from "../../communication/infra/repositories/drizzle/provider-name-reader.adapter";
import { DrizzleCustomerNameReader } from "../../communication/infra/repositories/drizzle/customer-name-reader.adapter";
import { DrizzleThreadPreviewReader } from "../../communication/infra/repositories/drizzle/thread-preview-reader.adapter";
import {
  CountOpenSupportRequestsProjection,
  GetSupportRequestProjection,
  ListSupportRequestMessagesProjection,
  ListSupportRequestsProjection,
} from "../app/use-cases/support-requests.projection";

/**
 * The three enrichment readers are `read/communication`'s, imported rather
 * than copied: an admin queue row and an inbox row want the same names and
 * the same preview from the same tables, and a second adapter running
 * identical SQL is two places to fix one bug — the ruling that tier's own
 * bootstrap gives for importing the write tier's repositories.
 */
export function bootstrapSupportRead() {
  const threadRepository = new DrizzleThreadRepository();
  const messageRepository = new DrizzleMessageRepository();
  const attachmentRepository = new DrizzleAttachmentRepository();
  const supportRequestRepository = new DrizzleSupportRequestRepository();
  const providerNameReader = new DrizzleProviderNameReader();
  const customerNameReader = new DrizzleCustomerNameReader();
  const threadPreviewReader = new DrizzleThreadPreviewReader();

  return {
    adapters: { threadRepository, messageRepository, attachmentRepository, supportRequestRepository },
    useCases: {
      listSupportRequests: new ListSupportRequestsProjection(
        supportRequestRepository,
        messageRepository,
        providerNameReader,
        customerNameReader,
        threadPreviewReader,
      ),
      getSupportRequest: new GetSupportRequestProjection(
        supportRequestRepository,
        messageRepository,
        providerNameReader,
        customerNameReader,
        threadPreviewReader,
      ),
      listSupportRequestMessages: new ListSupportRequestMessagesProjection(
        threadRepository,
        messageRepository,
        attachmentRepository,
      ),
      countOpenSupportRequests: new CountOpenSupportRequestsProjection(supportRequestRepository),
    },
  };
}

export type SupportReadBootstrap = ReturnType<typeof bootstrapSupportRead>;
