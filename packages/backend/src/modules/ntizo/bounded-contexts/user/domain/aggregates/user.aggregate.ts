// User aggregate — auth-linked minimal slice.
// Extended personal data lives in the Profile aggregate.

import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import type { UserRole, UserStatus, VerificationStatus } from "@ntizo/shared";
import { UserRegistered } from "../events";

export interface UserProps {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  verificationStatus: VerificationStatus | null;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  private readonly _events: BaseDomainEvent[] = [];

  private constructor(private readonly props: UserProps) {}

  /**
   * Records nothing, deliberately. Loading a user from the database is not a
   * registration, and an event here would welcome somebody every time their
   * row was read.
   */
  static rehydrate(props: UserProps): User {
    return new User(props);
  }

  /**
   * `firstName` is not stored on the User — extended personal data lives on
   * the Profile — and is taken only so `UserRegistered` can carry it. It sits
   * here rather than in the calling command so that the event is impossible
   * to forget: any future call site that creates a user gets it for free.
   */
  static create(params: {
    id: string;
    email: string;
    role?: UserRole;
    firstName?: string | null;
  }): User {
    const now = new Date();
    const user = new User({
      id: params.id,
      email: params.email,
      role: params.role ?? "customer",
      status: "active",
      verificationStatus: null,
      createdAt: now,
      updatedAt: now,
    });
    user.recordEvent(
      new UserRegistered({
        userId: params.id,
        email: params.email,
        firstName: params.firstName ?? null,
      }),
    );
    return user;
  }

  get id() {
    return this.props.id;
  }
  get email() {
    return this.props.email;
  }
  get role() {
    return this.props.role;
  }
  get status() {
    return this.props.status;
  }
  get verificationStatus(): VerificationStatus | null {
    return this.props.verificationStatus;
  }
  get isProvider(): boolean {
    return this.props.verificationStatus !== null;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  upgradeToProvider(): void {
    if (this.props.verificationStatus === null) {
      this.props.verificationStatus = "pending";
      this.props.updatedAt = new Date();
    }
  }

  revertProviderUpgrade(): void {
    this.props.verificationStatus = null;
    this.props.updatedAt = new Date();
  }

  // ---- events ------------------------------------------------------------

  recordEvent(event: BaseDomainEvent): void {
    this._events.push(event);
  }

  pullEvents(): BaseDomainEvent[] {
    const events = [...this._events];
    this._events.length = 0;
    return events;
  }

  toJSON(): UserProps {
    return { ...this.props };
  }
}
