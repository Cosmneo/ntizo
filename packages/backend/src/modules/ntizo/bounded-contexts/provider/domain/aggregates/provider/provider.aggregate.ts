// Provider aggregate — represents either an `individual` provider (a person)
// or an `organization` provider (an establishment with multiple staff).
//
// Mirrors flowzao's Organization aggregate but collapses the two ntizo
// provider types into a single aggregate via a discriminator.

import { Address } from "../../value-objects/address.vo";
import {
  IndividualProviderCannotHaveMembersError,
  InsufficientProviderPermissionsError,
  NotProviderOwnerError,
} from "../../exceptions";
import {
  type DomainEvent,
  ProviderCreated,
  ProviderDeactivated,
  ProviderUpdated,
} from "../../events";

export type ProviderType = "individual" | "organization";
export type ProviderStatus = "pending" | "active" | "suspended" | "archived";

export interface ProviderProps {
  id: string;
  ownerUserId: string;
  type: ProviderType;
  name: string;
  slug: string;
  status: ProviderStatus;
  description?: string;
  address?: Address;
  createdAt: Date;
  updatedAt: Date;
}

export class Provider {
  private readonly _events: DomainEvent[] = [];

  private constructor(private readonly props: ProviderProps) {}

  // ---- factories ---------------------------------------------------------

  static rehydrate(props: ProviderProps): Provider {
    return new Provider(props);
  }

  static create(params: {
    id: string;
    ownerUserId: string;
    type: ProviderType;
    name: string;
    slug: string;
    description?: string;
    address?: Address;
  }): Provider {
    const now = new Date();
    const provider = new Provider({
      id: params.id,
      ownerUserId: params.ownerUserId,
      type: params.type,
      name: params.name,
      slug: params.slug,
      status: "active",
      description: params.description,
      address: params.address,
      createdAt: now,
      updatedAt: now,
    });
    provider._events.push(
      new ProviderCreated({
        providerId: provider.id,
        ownerUserId: provider.ownerUserId,
        type: provider.type,
      }),
    );
    return provider;
  }

  // ---- getters -----------------------------------------------------------

  get id() {
    return this.props.id;
  }
  get ownerUserId() {
    return this.props.ownerUserId;
  }
  get type() {
    return this.props.type;
  }
  get name() {
    return this.props.name;
  }
  get slug() {
    return this.props.slug;
  }
  get status() {
    return this.props.status;
  }
  get description() {
    return this.props.description;
  }
  get address() {
    return this.props.address;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  // ---- invariants --------------------------------------------------------

  assertOwnedBy(userId: string): void {
    if (this.props.ownerUserId !== userId) {
      throw new NotProviderOwnerError(this.props.id, userId);
    }
  }

  /** Owner or admin members can manage members/invites. */
  assertCanManage(actorUserId: string, actorRole?: "admin" | "staff"): void {
    if (this.props.ownerUserId === actorUserId) return;
    if (actorRole === "admin") return;
    throw new InsufficientProviderPermissionsError(
      this.props.id,
      actorUserId,
    );
  }

  assertSupportsMembers(): void {
    if (this.props.type !== "organization") {
      throw new IndividualProviderCannotHaveMembersError(this.props.id);
    }
  }

  // ---- mutations ---------------------------------------------------------

  update(params: {
    name?: string;
    description?: string;
    address?: Address;
  }): void {
    if (params.name !== undefined) this.props.name = params.name;
    if (params.description !== undefined)
      this.props.description = params.description;
    if (params.address !== undefined) this.props.address = params.address;
    this.props.updatedAt = new Date();
    this._events.push(new ProviderUpdated({ providerId: this.props.id }));
  }

  deactivate(): void {
    this.props.status = "suspended";
    this.props.updatedAt = new Date();
    this._events.push(new ProviderDeactivated({ providerId: this.props.id }));
  }

  // ---- events ------------------------------------------------------------

  recordEvent(event: DomainEvent): void {
    this._events.push(event);
  }

  pullEvents(): DomainEvent[] {
    const events = [...this._events];
    this._events.length = 0;
    return events;
  }

  toJSON(): Omit<ProviderProps, "address"> & {
    address?: ReturnType<Address["toJSON"]>;
  } {
    return {
      ...this.props,
      address: this.props.address?.toJSON(),
    };
  }
}
