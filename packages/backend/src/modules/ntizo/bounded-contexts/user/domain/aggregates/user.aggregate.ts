// User aggregate — auth-linked minimal slice.
// Extended personal data lives in the Profile aggregate.

import type { UserRole, UserStatus, VerificationStatus } from "@ntizo/shared";

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
  private constructor(private readonly props: UserProps) {}

  static rehydrate(props: UserProps): User {
    return new User(props);
  }

  static create(params: {
    id: string;
    email: string;
    role?: UserRole;
  }): User {
    const now = new Date();
    return new User({
      id: params.id,
      email: params.email,
      role: params.role ?? "customer",
      status: "active",
      verificationStatus: null,
      createdAt: now,
      updatedAt: now,
    });
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

  toJSON(): UserProps {
    return { ...this.props };
  }
}
