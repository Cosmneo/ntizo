import { NotificationType } from "@ntizo/shared";
import { UnknownNotificationTypeError } from "../exceptions";

/** What a delivery can be. `suppressed` is a refusal, not a failure — see below. */
export type DeliveryStatus = "queued" | "sent" | "failed" | "suppressed";

export interface NotificationDeliveryProps {
  readonly id: string | null;
  readonly notificationId: string | null;
  readonly type: NotificationType;
  readonly channel: "EMAIL";
  readonly toEmail: string;
  readonly locale: string;
  readonly status: DeliveryStatus;
  readonly providerMessageId: string | null;
  readonly error: string | null;
}

const KNOWN_TYPES = new Set<string>(Object.values(NotificationType));

/**
 * One outbound attempt, and what became of it.
 *
 * **Immutable transitions.** `markSent` and `markFailed` return a new delivery
 * rather than mutating this one, matching how `Review.revise` works in this
 * codebase. A caller holding the queued instance keeps holding a queued
 * instance, which is what makes "write the row, then attempt, then update it"
 * readable rather than a sequence of hidden mutations.
 *
 * **`suppressed` is not `failed`.** A failure is something that was attempted
 * and did not work, and it invites a retry. A suppression is a send that never
 * happened because the address is on a list. Collapsing them would make the
 * audit unable to answer "how many emails did we actually try to send", which
 * is the question a bounce investigation starts from.
 */
export class NotificationDelivery {
  private constructor(private readonly props: NotificationDeliveryProps) {}

  static queue(input: {
    id?: string | null;
    notificationId?: string | null;
    type: NotificationType;
    toEmail: string;
    locale: string;
  }): NotificationDelivery {
    assertKnownType(input.type);
    return new NotificationDelivery({
      id: input.id ?? null,
      notificationId: input.notificationId ?? null,
      type: input.type,
      channel: "EMAIL",
      toEmail: input.toEmail,
      locale: input.locale,
      status: "queued",
      providerMessageId: null,
      error: null,
    });
  }

  static suppressed(input: {
    notificationId?: string | null;
    type: NotificationType;
    toEmail: string;
    locale: string;
  }): NotificationDelivery {
    assertKnownType(input.type);
    return new NotificationDelivery({
      id: null,
      notificationId: input.notificationId ?? null,
      type: input.type,
      channel: "EMAIL",
      toEmail: input.toEmail,
      locale: input.locale,
      status: "suppressed",
      providerMessageId: null,
      error: null,
    });
  }

  static rehydrate(props: NotificationDeliveryProps): NotificationDelivery {
    return new NotificationDelivery(props);
  }

  markSent(providerMessageId: string): NotificationDelivery {
    return new NotificationDelivery({
      ...this.props,
      status: "sent",
      providerMessageId,
      error: null,
    });
  }

  markFailed(error: string): NotificationDelivery {
    return new NotificationDelivery({
      ...this.props,
      status: "failed",
      providerMessageId: null,
      error,
    });
  }

  get id() { return this.props.id; }
  get notificationId() { return this.props.notificationId; }
  get type() { return this.props.type; }
  get channel() { return this.props.channel; }
  get toEmail() { return this.props.toEmail; }
  get locale() { return this.props.locale; }
  get status() { return this.props.status; }
  get providerMessageId() { return this.props.providerMessageId; }
  get error() { return this.props.error; }
}

function assertKnownType(type: NotificationType): void {
  if (!KNOWN_TYPES.has(type)) throw new UnknownNotificationTypeError(String(type));
}
