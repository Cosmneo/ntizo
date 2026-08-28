export { bootstrapCommunication, type CommunicationBootstrap } from "./bootstrap";

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
  ThreadNotVisibleError,
  ProviderNotContactableError,
  ThreadTypeInvalidError,
  CursorInvalidError,
} from "./domain/exceptions";

export { StartThreadCommand, type StartThreadInput } from "./app/use-cases/start-thread.command";
export { SendMessageCommand, type SendMessageInput } from "./app/use-cases/send-message.command";
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
export type { ProviderReaderPort } from "./app/ports/outbound/provider-reader.port";
export type {
  RaiseNotificationInput,
  RaiseNotificationInternalPort,
} from "./app/ports/outbound/raise-notification.port";
export type {
  NotifyUnreadInternalInput,
  NotifyUnreadInternalPort,
} from "./app/ports/inbound/notify-unread.internal.command.port";
