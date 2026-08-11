// Provider aggregate — represents either an `individual` provider (a person)
// or an `organization` provider (an establishment with multiple staff).
//
// Mirrors flowzao's Organization aggregate but collapses the two ntizo
// provider types into a single aggregate via a discriminator.

import type { BaseDomainEvent } from "@cosmneo/onion-lasagna";
import { Address } from "../../value-objects/address.vo";
import {
  ProviderStatus as SharedProviderStatus,
  canTransition,
  PaymentDirection,
  isPaymentMethodType,
  supportsDirection,
} from "@ntizo/shared";
import {
  InvalidPayoutDestinationError,
  InvalidProviderStatusTransitionError,
} from "../../exceptions";
import {
  IndividualProviderCannotHaveMembersError,
  InsufficientProviderPermissionsError,
  NotProviderOwnerError,
} from "../../exceptions";
import {
  ProviderCreated,
  ProviderDeactivated,
  ProviderStatusDecided,
  ProviderUpdated,
} from "../../events";

export type ProviderType = "individual" | "organization";
/**
 * Re-exported from the shared enum rather than declared here.
 *
 * The local union drifted: it carried `archived` and no `rejected`, so the
 * domain could not express the decision an admin actually makes on a pending
 * application.
 */
export type ProviderStatus = SharedProviderStatus;

export interface ProviderProps {
  id: string;
  ownerUserId: string;
  type: ProviderType;
  name: string;
  slug: string;
  status: ProviderStatus;
  payoutType: string | null;
  payoutIdentifier: string | null;
  description?: string;
  /**
   * The customer-side platform fee on this provider's bookings, in basis
   * points. Copied from the platform default at creation and kept, so the rate
   * a business signed up under does not move when the default does.
   *
   * Never a deduction from the provider — they receive the price they quoted.
   */
  commissionBps: number;
  /** R2 key of the logo, not a URL — see the schema for why. */
  logoKey?: string;
  /** R2 keys of the portfolio, in the order they should be shown. */
  photoKeys?: string[];
  address?: Address;
  createdAt: Date;
  updatedAt: Date;
}

export class Provider {
  private readonly _events: BaseDomainEvent[] = [];

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
    /** From the platform default. Required, so it cannot be forgotten. */
    commissionBps: number;
  }): Provider {
    const now = new Date();
    const provider = new Provider({
      id: params.id,
      ownerUserId: params.ownerUserId,
      type: params.type,
      name: params.name,
      slug: params.slug,
      commissionBps: params.commissionBps,
      // An application, not a live business.
      //
      // Registering creates a workspace the owner can start filling in; it does
      // not put them in front of customers. The public directory shows only
      // `Active`, so nothing here is findable or bookable until an
      // administrator decides — which is what makes the "verified" badge and
      // the review queue mean anything.
      status: SharedProviderStatus.Pending,
      payoutType: null,
      payoutIdentifier: null,
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

  get commissionBps() {
    return this.props.commissionBps;
  }

  /**
   * Only an administrator reaches this.
   *
   * Separate from `update()` rather than another optional field on it: that
   * method is what the provider's own settings page calls, and a rate they can
   * set for themselves is not a rate. Keeping it out of that shape means the
   * mistake cannot be made by adding a line to a form.
   */
  setCommissionByAdmin(bps: number): void {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
      throw new RangeError(`commissionBps out of range: ${bps}`);
    }
    this.props.commissionBps = bps;
    this.props.updatedAt = new Date();
    this._events.push(new ProviderUpdated({ providerId: this.props.id }));
  }

  /**
   * Where this business is paid.
   *
   * Both together or neither: a method with no number and a number with no
   * method are each half of an instruction, and storing half means the payout
   * fails at the moment it matters instead of at the moment it was entered.
   *
   * A card is refused. Card networks push refunds back to the original charge,
   * never to an arbitrary account, so "pay me on this Visa" is not a thing that
   * can happen — `supportsDirection` already says so and this is where it is
   * enforced rather than trusted to whichever form asked.
   */
  setPayoutDestination(type: string | null, identifier: string | null): void {
    const t = type?.trim() || null;
    const id = identifier?.trim() || null;
    if ((t === null) !== (id === null)) {
      throw new InvalidPayoutDestinationError(
        "A payout destination needs both a method and an identifier",
        "PAYOUT_INCOMPLETE",
      );
    }
    if (t !== null) {
      if (!isPaymentMethodType(t) || !supportsDirection(t, PaymentDirection.Payout)) {
        throw new InvalidPayoutDestinationError(
          `Not a payout-capable method: ${t}`,
          "PAYOUT_METHOD_NOT_CAPABLE",
        );
      }
    }
    this.props.payoutType = t;
    this.props.payoutIdentifier = id;
    this.props.updatedAt = new Date();
    this._events.push(new ProviderUpdated({ providerId: this.props.id }));
  }

  update(params: {
    name?: string;
    description?: string;
    address?: Address;
    /** `null` clears it; `undefined` leaves it alone. */
    logoKey?: string | null;
    photoKeys?: string[];
  }): void {
    if (params.name !== undefined) this.props.name = params.name;
    if (params.description !== undefined)
      this.props.description = params.description;
    if (params.address !== undefined) this.props.address = params.address;
    // Distinguishing null from undefined is what lets the logo be *removed*.
    // Treating both as "no change" would make the remove button do nothing.
    if (params.logoKey !== undefined) this.props.logoKey = params.logoKey ?? undefined;
    if (params.photoKeys !== undefined) this.props.photoKeys = params.photoKeys;
    this.props.updatedAt = new Date();
    this._events.push(new ProviderUpdated({ providerId: this.props.id }));
  }

  deactivate(): void {
    this.props.status = SharedProviderStatus.Suspended;
    this.props.updatedAt = new Date();
    this._events.push(new ProviderDeactivated({ providerId: this.props.id }));
  }

  /**
   * An administrator's decision about whether this business may trade.
   *
   * The legal moves live in the shared enum and are checked here rather than
   * at the edge: the UI only offers legal ones, and the UI is not the thing
   * that has to be right. Rejecting a business that already traded and
   * suspending one that never did are both refused — they read the same to
   * whoever clicks and mean different things afterwards.
   */
  decide(to: SharedProviderStatus, decidedByUserId: string): void {
    const from = this.props.status;
    if (!canTransition(from, to)) {
      throw new InvalidProviderStatusTransitionError(from, to);
    }
    this.props.status = to;
    this.props.updatedAt = new Date();
    this._events.push(
      new ProviderStatusDecided({ providerId: this.props.id, from, to, decidedByUserId }),
    );
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

  toJSON(): Omit<ProviderProps, "address"> & {
    address?: ReturnType<Address["toJSON"]>;
  } {
    return {
      ...this.props,
      address: this.props.address?.toJSON(),
    };
  }
}
