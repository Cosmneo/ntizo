import { NotificationType } from "@ntizo/shared";
import { UnknownNotificationTypeError } from "../exceptions";

/** Which of the two id columns carries the addressee. Mirrors the CHECK on the table. */
export type NotificationAudience = "user" | "provider";

/** Whatever a template or a cell needs to render this item, captured when it was raised. */
export type NotificationPayload = Record<string, unknown>;

export interface NotificationProps {
  readonly id: string | null;
  readonly type: NotificationType;
  readonly audience: NotificationAudience;
  readonly userId: string | null;
  readonly providerId: string | null;
  readonly payload: NotificationPayload;
}

const KNOWN_TYPES = new Set<string>(Object.values(NotificationType));

/**
 * One item in somebody's inbox.
 *
 * Two named constructors rather than one taking an audience, because the two
 * cases take different arguments and a single `create` would have to accept
 * both ids as nullable and then check that exactly one arrived — which is the
 * bug the table's CHECK exists to catch, reimplemented in TypeScript. Naming
 * them makes the wrong call unwritable instead of merely refused.
 *
 * **The payload is copied, not referenced.** It is a snapshot of what was true
 * when the notification was raised, and a caller holding the object it passed
 * in could otherwise mutate an inbox item after the fact. Shallow is enough:
 * every payload in this system is flat strings and numbers, and a deep clone
 * would buy nothing but a dependency on structuredClone in a Worker.
 *
 * There is no `markRead` here. Read state belongs to a reader, not to the
 * notification — a workspace item is read by each member independently, so it
 * lives in its own table and its own command.
 */
export class Notification {
  private constructor(private readonly props: NotificationProps) {}

  static forUser(input: {
    id?: string | null;
    type: NotificationType;
    userId: string;
    payload: NotificationPayload;
  }): Notification {
    assertKnownType(input.type);
    return new Notification({
      id: input.id ?? null,
      type: input.type,
      audience: "user",
      userId: input.userId,
      providerId: null,
      payload: { ...input.payload },
    });
  }

  static forProvider(input: {
    id?: string | null;
    type: NotificationType;
    providerId: string;
    payload: NotificationPayload;
  }): Notification {
    assertKnownType(input.type);
    return new Notification({
      id: input.id ?? null,
      type: input.type,
      audience: "provider",
      userId: null,
      providerId: input.providerId,
      payload: { ...input.payload },
    });
  }

  get id(): string | null {
    return this.props.id;
  }
  get type(): NotificationType {
    return this.props.type;
  }
  get audience(): NotificationAudience {
    return this.props.audience;
  }
  get userId(): string | null {
    return this.props.userId;
  }
  get providerId(): string | null {
    return this.props.providerId;
  }
  get payload(): NotificationPayload {
    return this.props.payload;
  }
}

function assertKnownType(type: NotificationType): void {
  if (!KNOWN_TYPES.has(type)) throw new UnknownNotificationTypeError(String(type));
}
