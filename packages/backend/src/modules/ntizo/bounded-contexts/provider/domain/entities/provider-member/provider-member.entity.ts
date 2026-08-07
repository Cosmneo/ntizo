export type ProviderMemberRole = "owner" | "admin" | "staff";

export interface ProviderMemberProps {
  id: string;
  providerId: string;
  userId: string;
  role: ProviderMemberRole;
  joinedAt: Date;
}

export class ProviderMember {
  private constructor(private readonly props: ProviderMemberProps) {}

  static rehydrate(props: ProviderMemberProps): ProviderMember {
    return new ProviderMember(props);
  }

  static create(params: {
    id: string;
    providerId: string;
    userId: string;
    role: ProviderMemberRole;
  }): ProviderMember {
    return new ProviderMember({
      id: params.id,
      providerId: params.providerId,
      userId: params.userId,
      role: params.role,
      joinedAt: new Date(),
    });
  }

  get id() {
    return this.props.id;
  }
  get providerId() {
    return this.props.providerId;
  }
  get userId() {
    return this.props.userId;
  }
  get role() {
    return this.props.role;
  }
  get joinedAt() {
    return this.props.joinedAt;
  }

  changeRole(role: ProviderMemberRole): void {
    this.props.role = role;
  }

  toJSON(): ProviderMemberProps {
    return { ...this.props };
  }
}
