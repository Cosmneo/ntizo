import {
  isContactTopicForKind,
  contactEmailRequired,
  contactReferenceOf,
  type ContactRequestKind,
  type ContactRequestStatus,
  type ContactTopic,
} from "@ntizo/shared";
import {
  ContactEmailInvalidError,
  ContactEmailRequiredError,
  ContactMessageInvalidError,
  ContactNameInvalidError,
  ContactTopicInvalidError,
} from "../exceptions";

export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
export const EMAIL_MAX = 254;
export const ORIGIN_PATH_MAX = 200;
export const LOCALE_MAX = 16;

/** Something, an @, something, a dot, something. Not RFC 5322 — a reply has to reach it, that is all. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactRequestProps {
  readonly id: string | null;
  readonly kind: ContactRequestKind;
  readonly topic: ContactTopic;
  readonly name: string;
  readonly email: string | null;
  readonly message: string;
  readonly requesterUserId: string | null;
  readonly locale: string;
  readonly originPath: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly status: ContactRequestStatus;
  readonly resolvedAt: Date | null;
  readonly resolvedByUserId: string | null;
  readonly createdAt: Date | null;
}

/**
 * One message somebody sent us through a form.
 *
 * Small, like `Review`, and an aggregate for the same reason: a handful of
 * rules — a name and a message within bounds, an email unless it is feedback,
 * a topic that belongs to the form it came from — that must hold identically
 * from the API, from a test, and from any future import.
 *
 * **Normalised once, here.** Names and messages are trimmed; the email is
 * trimmed and lower-cased so the admin search finds `Joana@…` under `joana@…`;
 * an empty email is `null`, never `""`. The origin path and the locale are
 * telemetry, not the person's words, so an over-long one is cut rather than
 * refused — refusing a message because the URL it came from was long would be
 * punishing the person for our own routing.
 *
 * `resolve` and `reopen` are idempotent: two administrators pressing the same
 * button at once is an ordinary thing, not an error, and the first press wins.
 */
export class ContactRequest {
  private constructor(private readonly props: ContactRequestProps) {}

  static create(input: {
    kind: ContactRequestKind;
    topic: string;
    name: string;
    email: string | null;
    message: string;
    locale: string;
    originPath: string | null;
    requesterUserId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
  }): ContactRequest {
    const name = input.name.trim();
    if (name.length < NAME_MIN || name.length > NAME_MAX) throw new ContactNameInvalidError(name.length);

    const message = input.message.trim();
    if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
      throw new ContactMessageInvalidError(message.length);
    }

    const email = (input.email ?? "").trim().toLowerCase() || null;
    if (email === null && contactEmailRequired(input.kind)) throw new ContactEmailRequiredError();
    if (email !== null && (email.length > EMAIL_MAX || !EMAIL_SHAPE.test(email))) {
      throw new ContactEmailInvalidError();
    }

    if (!isContactTopicForKind(input.kind, input.topic)) {
      throw new ContactTopicInvalidError(input.kind, input.topic);
    }

    return new ContactRequest({
      id: null,
      kind: input.kind,
      topic: input.topic,
      name,
      email,
      message,
      requesterUserId: input.requesterUserId,
      locale: input.locale.trim().slice(0, LOCALE_MAX) || "en-US",
      originPath: input.originPath?.trim().slice(0, ORIGIN_PATH_MAX) || null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      status: "open",
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: null,
    });
  }

  /** A row as the repository read it back. No validation: it was validated when written. */
  static reconstitute(props: ContactRequestProps): ContactRequest {
    return new ContactRequest(props);
  }

  get id(): string | null { return this.props.id; }
  get kind(): ContactRequestKind { return this.props.kind; }
  get topic(): ContactTopic { return this.props.topic; }
  get name(): string { return this.props.name; }
  get email(): string | null { return this.props.email; }
  get message(): string { return this.props.message; }
  get requesterUserId(): string | null { return this.props.requesterUserId; }
  get locale(): string { return this.props.locale; }
  get originPath(): string | null { return this.props.originPath; }
  get ipAddress(): string | null { return this.props.ipAddress; }
  get userAgent(): string | null { return this.props.userAgent; }
  get status(): ContactRequestStatus { return this.props.status; }
  get resolvedAt(): Date | null { return this.props.resolvedAt; }
  get resolvedByUserId(): string | null { return this.props.resolvedByUserId; }
  get createdAt(): Date | null { return this.props.createdAt; }

  /** The six characters a person quotes back. Only a stored request has one. */
  get reference(): string {
    if (!this.props.id) throw new Error("A contact request has no reference until it is stored");
    return contactReferenceOf(this.props.id);
  }

  /** The same request, now stored. The repository calls this with the id Postgres assigned. */
  withId(id: string, createdAt: Date = new Date()): ContactRequest {
    return new ContactRequest({ ...this.props, id, createdAt });
  }

  resolve(at: Date, byUserId: string): ContactRequest {
    if (this.props.status === "resolved") return this;
    return new ContactRequest({ ...this.props, status: "resolved", resolvedAt: at, resolvedByUserId: byUserId });
  }

  reopen(): ContactRequest {
    if (this.props.status === "open") return this;
    return new ContactRequest({ ...this.props, status: "open", resolvedAt: null, resolvedByUserId: null });
  }
}
