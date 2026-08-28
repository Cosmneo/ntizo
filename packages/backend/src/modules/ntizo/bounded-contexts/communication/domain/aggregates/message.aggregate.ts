import { MessageEmptyError, MessageBodyTooLongError, TooManyAttachmentsError } from "../exceptions";

/** A message body's hard ceiling, trimmed length. Matches the DB CHECK — see Task 1's schema. */
export const MESSAGE_BODY_MAX = 4000;

/** The most attachments one message may carry. See Task 2's brief. */
import { MAX_ATTACHMENTS } from "@ntizo/shared/attachments";

// Re-exported so callers of this aggregate keep importing it from here.
export { MAX_ATTACHMENTS };

/**
 * How long a message waits, unread, before anybody is told about it. One
 * named constant rather than a literal repeated in the command that sets
 * `notifyDueAt` and again in the sweep that later queries for it — the
 * window is what the product means; the cron interval that later checks for
 * it is a separate, unrelated number.
 */
export const NOTIFY_AFTER_MS = 120_000;

export interface MessageProps {
  readonly id: string | null;
  readonly threadId: string;
  readonly senderUserId: string;
  readonly body: string;
  readonly readAt: Date | null;
  readonly notifyDueAt: Date | null;
  readonly notifiedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * One message inside a thread.
 *
 * `compose` and `rehydrate` are deliberately two different static factories
 * rather than one method with a "skip validation" flag: a flag is a branch
 * that can be flipped by accident at a call site, while two named factories
 * put the decision in the method the caller already had to choose between.
 *
 * **The write path validates. The read path does not.** A row already in
 * `ntizo_communication.message` was valid when it was written — under
 * whatever rule was in force *then* — and re-validating it against *today's*
 * rule on every read would mean a rule change (say, tightening
 * `MESSAGE_BODY_MAX`) breaks every older row it reads back rather than only
 * blocking new ones going forward. That is the same split
 * `Activity.record` / `Activity.rehydrate` make, and the same reason.
 */
export class Message {
  private constructor(readonly props: MessageProps) {}

  /**
   * The write path: validates, then computes `notifyDueAt` from `now`.
   *
   * `id` is always `null` here — the repository assigns it on insert, the
   * same way `Review.create` and `Activity.record` leave theirs unset.
   *
   * `attachmentCount` defaults to `0` rather than being a strictly required
   * argument: `SendMessageCommand` (Task 4's concern, not this task's file
   * list) and the real-DB repository tests still call `compose` without it,
   * and a required field would break both to typecheck for a change neither
   * asked for. The rule this default preserves is the one that matters — a
   * body-less, attachment-less call still throws `MessageEmptyError`.
   */
  static compose(params: {
    threadId: string;
    senderUserId: string;
    body: string;
    attachmentCount?: number;
    now: Date;
  }): Message {
    const body = params.body.trim();
    const attachmentCount = params.attachmentCount ?? 0;
    // The rule is that a message carries something, not that it has words.
    // A photograph with no caption is a message; an empty box is not.
    if (body.length === 0 && attachmentCount === 0) throw new MessageEmptyError();
    if (body.length > MESSAGE_BODY_MAX) throw new MessageBodyTooLongError(body.length, MESSAGE_BODY_MAX);
    if (attachmentCount > MAX_ATTACHMENTS) throw new TooManyAttachmentsError(attachmentCount, MAX_ATTACHMENTS);

    return new Message({
      id: null,
      threadId: params.threadId,
      senderUserId: params.senderUserId,
      body,
      readAt: null,
      notifyDueAt: new Date(params.now.getTime() + NOTIFY_AFTER_MS),
      notifiedAt: null,
      createdAt: params.now,
    });
  }

  /**
   * The read path: trusts the database, checks nothing. Used only by the
   * repository, to turn a stored row back into a `Message`.
   */
  static rehydrate(props: MessageProps): Message {
    return new Message(props);
  }

  get id(): string | null {
    return this.props.id;
  }
  get threadId(): string {
    return this.props.threadId;
  }
  get senderUserId(): string {
    return this.props.senderUserId;
  }
  get body(): string {
    return this.props.body;
  }
  get readAt(): Date | null {
    return this.props.readAt;
  }
  get notifyDueAt(): Date | null {
    return this.props.notifyDueAt;
  }
  get notifiedAt(): Date | null {
    return this.props.notifiedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
