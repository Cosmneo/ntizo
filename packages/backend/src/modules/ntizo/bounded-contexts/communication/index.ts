export {
  bootstrapCommunication,
  type CommunicationBootstrap,
  type CommunicationBootstrapDeps,
} from "./bootstrap";

export {
  MAX_ATTACHMENT_BYTES,
  ACCEPTED_ATTACHMENT_TYPES,
  sniffContentType,
} from "./domain/attachment";

export { Thread } from "./domain/aggregates/thread.aggregate";
export {
  Message,
  MESSAGE_BODY_MAX,
  MAX_ATTACHMENTS,
  NOTIFY_AFTER_MS,
} from "./domain/aggregates/message.aggregate";
export {
  MessageEmptyError,
  MessageBodyTooLongError,
  TooManyAttachmentsError,
  AttachmentNotAvailableError,
  ThreadNotVisibleError,
  ProviderNotContactableError,
  ThreadTypeInvalidError,
  CursorInvalidError,
} from "./domain/exceptions";

export { StartThreadCommand, type StartThreadInput } from "./app/use-cases/start-thread.command";
export {
  SendMessageCommand,
  type SendMessageInput,
  type AttachmentDescriptor,
} from "./app/use-cases/send-message.command";
export {
  MarkThreadReadCommand,
  type MarkThreadReadInput,
} from "./app/use-cases/mark-thread-read.command";
export { NotifyUnreadInternalCommand } from "./app/use-cases/notify-unread.internal.command";

export type {
  ThreadOpenResult,
  ThreadPage,
  ThreadRepositoryPort,
} from "./app/ports/outbound/thread.repository.port";
export type {
  DueMessage,
  MessagePage,
  MessageRepositoryPort,
} from "./app/ports/outbound/message.repository.port";
export type {
  NewAttachment,
  AttachmentRepositoryPort,
} from "./app/ports/outbound/attachment.repository.port";
export type {
  StoredAttachmentMetadata,
  AttachmentStoragePort,
} from "./app/ports/outbound/attachment-storage.port";
export type { ProviderReaderPort } from "./app/ports/outbound/provider-reader.port";
export type {
  RaiseNotificationInput,
  RaiseNotificationInternalPort,
} from "./app/ports/outbound/raise-notification.port";
export type {
  NotifyUnreadInternalInput,
  NotifyUnreadInternalPort,
} from "./app/ports/inbound/notify-unread.internal.command.port";

export {
  SupportRequest,
  SUPPORT_SUBJECT_MAX,
  MAX_OPEN_SUPPORT_REQUESTS,
} from "./domain/aggregates/support-request.aggregate";
export {
  SupportSubjectInvalidError,
  SupportNotAMemberError,
  SupportBookingNotYoursError,
  SupportRequestNotFoundError,
  SupportAlreadyResolvedError,
  SupportRequestNotResolvedError,
  SupportTooManyOpenError,
} from "./domain/exceptions";
export {
  OpenSupportRequestCommand,
  type OpenSupportRequestInput,
} from "./app/use-cases/open-support-request.command";
export {
  ReplyToSupportRequestCommand,
  type ReplyToSupportRequestInput,
} from "./app/use-cases/reply-to-support-request.command";
export {
  ResolveSupportRequestCommand,
  type ResolveSupportRequestInput,
} from "./app/use-cases/resolve-support-request.command";
export { MarkSupportRequestReadCommand } from "./app/use-cases/mark-support-request-read.command";
export type {
  SupportRequestFilter,
  SupportRequestListItem,
  SupportRequestPage,
  SupportRequestRepositoryPort,
} from "./app/ports/outbound/support-request.repository.port";
export type { BookingReaderPort } from "./app/ports/outbound/booking-reader.port";
export type { AdminUserReaderPort } from "./app/ports/outbound/admin-user-reader.port";
