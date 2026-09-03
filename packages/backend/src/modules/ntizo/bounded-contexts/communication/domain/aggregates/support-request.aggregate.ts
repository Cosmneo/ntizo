import type {
  SupportAudience,
  SupportStatus,
} from "../../../../shared/infrastructure/database/communication/enums";
import {
  SupportAlreadyResolvedError,
  SupportRequestNotResolvedError,
  SupportSubjectInvalidError,
} from "../exceptions";

/** Matches the `varchar(120)` on `support_request.subject`. */
export const SUPPORT_SUBJECT_MAX = 120;

/**
 * How many requests one requester may have open at once — a cheap abuse
 * guard, not a product rule. A person with ten unanswered requests has a
 * problem this limit does not solve, and one who reaches it is told to reply
 * on one of them instead.
 */
export const MAX_OPEN_SUPPORT_REQUESTS = 10;

export interface SupportRequestProps {
  readonly threadId: string;
  readonly audience: SupportAudience;
  readonly subject: string;
  readonly bookingId: string | null;
  readonly status: SupportStatus;
  readonly resolvedAt: Date | null;
  readonly resolvedByUserId: string | null;
  readonly createdAt: Date;
}

/**
 * The lifecycle of a support request. The conversation itself is the
 * `Thread` this points at; this holds only what an inquiry does not have —
 * a subject and whether the platform considers it done.
 *
 * Two states. `resolve` is the admin's act; `reopen` is what a requester's
 * reply does to a resolved request, in `SendMessageCommand`. There is no
 * separate "reopen" mutation and no third state: two are enough for a
 * queue, and a third is a product decision to take when the queue asks for
 * it.
 *
 * Same `open` / `rehydrate` split as `Thread` and `Message`, for the same
 * reason: the write path validates today's rule, the read path trusts what
 * was valid when it was written.
 *
 * Transitions return a new instance rather than mutating — `props` is
 * readonly all the way down, and a repository `save` takes the instance it
 * is handed, so there is no shared object to get half-updated.
 */
export class SupportRequest {
  private constructor(readonly props: SupportRequestProps) {}

  /**
   * The subject rule, callable on its own so a command can refuse a bad
   * subject *before* it opens a transaction and inserts a thread — the same
   * cheap-check-first ordering `SendMessageCommand` uses for the body.
   */
  static normaliseSubject(subject: string): string {
    const trimmed = subject.trim();
    if (trimmed.length === 0 || trimmed.length > SUPPORT_SUBJECT_MAX) {
      throw new SupportSubjectInvalidError(trimmed.length, SUPPORT_SUBJECT_MAX);
    }
    return trimmed;
  }

  static open(params: {
    threadId: string;
    audience: SupportAudience;
    subject: string;
    bookingId: string | null;
    now: Date;
  }): SupportRequest {
    return new SupportRequest({
      threadId: params.threadId,
      audience: params.audience,
      subject: SupportRequest.normaliseSubject(params.subject),
      bookingId: params.bookingId,
      status: "open",
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: params.now,
    });
  }

  static rehydrate(props: SupportRequestProps): SupportRequest {
    return new SupportRequest(props);
  }

  resolve(byUserId: string, now: Date): SupportRequest {
    if (this.props.status === "resolved") throw new SupportAlreadyResolvedError();
    return new SupportRequest({
      ...this.props,
      status: "resolved",
      resolvedAt: now,
      resolvedByUserId: byUserId,
    });
  }

  reopen(): SupportRequest {
    if (this.props.status !== "resolved") throw new SupportRequestNotResolvedError();
    return new SupportRequest({
      ...this.props,
      status: "open",
      resolvedAt: null,
      resolvedByUserId: null,
    });
  }

  get threadId(): string {
    return this.props.threadId;
  }
  get audience(): SupportAudience {
    return this.props.audience;
  }
  get subject(): string {
    return this.props.subject;
  }
  get bookingId(): string | null {
    return this.props.bookingId;
  }
  get status(): SupportStatus {
    return this.props.status;
  }
  get resolvedAt(): Date | null {
    return this.props.resolvedAt;
  }
  get resolvedByUserId(): string | null {
    return this.props.resolvedByUserId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
