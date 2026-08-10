import {
  InviteAlreadyUsedError,
  InviteExpiredError,
} from "../../exceptions";

export type ProviderInviteRole = "admin" | "staff";
export type ProviderInviteStatus =
  | "pending"
  | "accepted"
  | "revoked"
  /**
   * Turned down by the person it was sent to.
   *
   * Its own state rather than folded into `revoked`, because the two say
   * opposite things about who decided: revoked is the workspace withdrawing an
   * offer, declined is the invitee refusing one. An admin looking at the list
   * needs to tell those apart — one means "I changed my mind", the other means
   * "they said no", and only the second is a reason not to send it again.
   */
  | "declined"
  | "expired";

export interface ProviderInviteProps {
  id: string;
  providerId: string;
  email: string;
  role: ProviderInviteRole;
  token: string;
  status: ProviderInviteStatus;
  expiresAt: Date;
  createdAt: Date;
}

export class ProviderInvite {
  private constructor(private readonly props: ProviderInviteProps) {}

  static rehydrate(props: ProviderInviteProps): ProviderInvite {
    return new ProviderInvite(props);
  }

  static create(params: {
    id: string;
    providerId: string;
    email: string;
    role: ProviderInviteRole;
    token: string;
    expiresAt: Date;
  }): ProviderInvite {
    return new ProviderInvite({
      id: params.id,
      providerId: params.providerId,
      email: params.email.toLowerCase(),
      role: params.role,
      token: params.token,
      status: "pending",
      expiresAt: params.expiresAt,
      createdAt: new Date(),
    });
  }

  get id() {
    return this.props.id;
  }
  get providerId() {
    return this.props.providerId;
  }
  get email() {
    return this.props.email;
  }
  get role() {
    return this.props.role;
  }
  get token() {
    return this.props.token;
  }
  get status() {
    return this.props.status;
  }
  get expiresAt() {
    return this.props.expiresAt;
  }
  get createdAt() {
    return this.props.createdAt;
  }

  assertUsable(now: Date = new Date()): void {
    if (this.props.status !== "pending") {
      throw new InviteAlreadyUsedError(this.props.token);
    }
    if (this.props.expiresAt.getTime() < now.getTime()) {
      this.props.status = "expired";
      throw new InviteExpiredError(this.props.token);
    }
  }

  markAccepted(): void {
    this.props.status = "accepted";
  }

  markRevoked(): void {
    this.props.status = "revoked";
  }

  markDeclined(): void {
    this.props.status = "declined";
  }

  toJSON(): ProviderInviteProps {
    return { ...this.props };
  }
}
